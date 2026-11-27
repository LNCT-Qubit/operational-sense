import {
  claimNextPendingDraft,
  getDraftAttachmentKey,
  markDraftAttachmentUploaded,
  markDraftAudioUploaded,
  markDraftServerSynced,
  markDraftSyncCompleted,
  markDraftSyncFailed,
  scopeDraftsToUser,
  type HydratedTechnicianDraft,
} from '../features/draftStore';
import { getAccessToken, getSessionUser } from '../api/session';
import { uploadDraftAttachmentRequest, upsertDraftRequest } from '../api/drafts';
import { UPLOAD_TIMEOUT_MS, uploadRecording } from './uploadService';

export const UPLOAD_LEASE_DURATION_MS = 60_000;
export const MAX_SYNC_RETRIES = 5;

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_RETRY_AFTER_MS = 300_000;

export type SyncPhase = 'idle' | 'syncing' | 'paused_offline' | 'paused_auth' | 'backoff' | 'error';

export interface SyncStateSnapshot {
  phase: SyncPhase;
  isSyncing: boolean;
  activeDraftId: string | null;
  lastError: string | null;
  nextRetryAt: number | null;
  lastSyncAt: number | null;
  revision: number;
}

interface StageFailure {
  authError?: boolean;
  retryable?: boolean;
  networkError?: boolean;
  timeoutError?: boolean;
  retryAfterMs?: number;
  errorMessage?: string;
}

const listeners = new Set<(snapshot: SyncStateSnapshot) => void>();

let snapshot: SyncStateSnapshot = {
  phase: typeof navigator !== 'undefined' && navigator.onLine === false ? 'paused_offline' : 'idle',
  isSyncing: false,
  activeDraftId: null,
  lastError: null,
  nextRetryAt: null,
  lastSyncAt: null,
  revision: 0,
};

let inFlightDrain: Promise<void> | null = null;
let rerunRequested = false;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;
let activeAbortController: AbortController | null = null;
let activeStarts = 0;
let listenersAttached = false;

function emit(patch: Partial<SyncStateSnapshot>, bumpRevision = false): void {
  snapshot = {
    ...snapshot,
    ...patch,
    revision: bumpRevision ? snapshot.revision + 1 : snapshot.revision,
  };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function clearBackoffTimer(): void {
  if (backoffTimer !== null) {
    clearTimeout(backoffTimer);
    backoffTimer = null;
  }
}

export function computeBackoffDelayMs(attempt: number, retryAfterMs?: number): number {
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.round(retryAfterMs)));
  }
  const exponent = Math.max(0, attempt - 1);
  const capped = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.min(MAX_BACKOFF_MS, Math.round(capped * jitterFactor));
}

function scheduleBackoff(delayMs: number): void {
  clearBackoffTimer();
  const nextRetryAt = Date.now() + delayMs;
  emit({ nextRetryAt });
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    emit({ nextRetryAt: null });
    void syncPendingDrafts();
  }, delayMs);
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine;
}

async function handleStageFailure(
  draft: HydratedTechnicianDraft,
  failure: StageFailure,
): Promise<'break_outer' | 'continue'> {
  if (failure.authError) {
    const message = failure.errorMessage ?? 'Authentication expired. Sign in again.';
    await markDraftSyncFailed(draft.id, message, {
      revertToPending: true,
      consumeRetry: false,
    });
    clearBackoffTimer();
    emit(
      {
        phase: 'paused_auth',
        isSyncing: false,
        activeDraftId: null,
        lastError: message,
        nextRetryAt: null,
      },
      true,
    );
    rerunRequested = false;
    return 'break_outer';
  }

  if (failure.retryable || failure.networkError || failure.timeoutError) {
    const message = failure.errorMessage ?? 'Sync failed. Will retry.';
    const exhausted = draft.retryCount >= MAX_SYNC_RETRIES;

    if (exhausted) {
      await markDraftSyncFailed(draft.id, message, { revertToPending: false });
    } else {
      await markDraftSyncFailed(draft.id, message, {
        revertToPending: true,
        consumeRetry: true,
      });
    }

    if (!isOnline()) {
      clearBackoffTimer();
      emit(
        {
          phase: 'paused_offline',
          isSyncing: false,
          activeDraftId: null,
          lastError: message,
          nextRetryAt: null,
        },
        true,
      );
    } else {
      const delayMs = computeBackoffDelayMs(draft.retryCount, failure.retryAfterMs);
      emit(
        {
          phase: exhausted ? 'error' : 'backoff',
          isSyncing: false,
          activeDraftId: null,
          lastError: message,
        },
        true,
      );
      scheduleBackoff(delayMs);
    }
    rerunRequested = false;
    return 'break_outer';
  }

  const permanentMessage = failure.errorMessage ?? 'Sync failed.';
  await markDraftSyncFailed(draft.id, permanentMessage, { revertToPending: false });
  emit(
    {
      activeDraftId: null,
      lastError: permanentMessage,
    },
    true,
  );
  return 'continue';
}

async function syncClaimedDraft(
  draft: HydratedTechnicianDraft,
  signal: AbortSignal,
): Promise<'completed' | 'break_outer' | 'continue'> {
  let serverRecordingId = draft.serverRecordingId;

  // Stage 1: Upload audio if present and not yet checkpointed.
  if (draft.audio && draft.audio.size > 0 && !serverRecordingId) {
    const audioResult = await uploadRecording(draft, signal, UPLOAD_TIMEOUT_MS);
    if (!audioResult.ok || !audioResult.serverRecordingId) {
      return handleStageFailure(draft, audioResult);
    }
    serverRecordingId = audioResult.serverRecordingId;
    await markDraftAudioUploaded(draft.id, serverRecordingId);
  }

  // Stage 2: Sync structured draft metadata idempotently if not yet checkpointed.
  let serverDraftId = draft.serverDraftId;
  if (!serverDraftId) {
    const draftResult = await upsertDraftRequest(
      {
        clientDraftId: draft.id,
        recordingId: serverRecordingId ?? null,
        captureMode: draft.mode.toLowerCase() === 'voice' ? 'voice' : 'text',
        equipment: draft.equipment,
        subsystem: draft.subsystem,
        symptom: draft.symptom,
        observation: draft.observation,
        probableCause: draft.cause,
        actionTaken: draft.action,
        partsUsed: draft.parts,
        safetyNotes: draft.safety,
        durationMs: draft.durationMs ?? draft.duration ?? null,
        recordedAt: draft.recordedAt ?? null,
        clientCreatedAt: draft.createdAt ?? null,
        clientUpdatedAt: draft.updatedAt ?? null,
        status: 'PENDING_REVIEW',
      },
      signal,
      UPLOAD_TIMEOUT_MS,
    );
    if (!draftResult.ok || !draftResult.data?.draft?.id) {
      return handleStageFailure(draft, draftResult);
    }
    serverDraftId = draftResult.data.draft.id;
    await markDraftServerSynced(draft.id, serverDraftId);
  }

  // Stage 3: Upload remaining attachments not yet recorded in syncedAttachmentKeys.
  const syncedKeys = new Set(draft.syncedAttachmentKeys ?? []);
  for (let i = 0; i < draft.attachments.length; i += 1) {
    const att = draft.attachments[i];
    const key = getDraftAttachmentKey(draft.id, i, att);
    if (syncedKeys.has(key)) continue;

    const attResult = await uploadDraftAttachmentRequest(
      serverDraftId,
      { key, name: att.name, type: att.type, blob: att.blob },
      signal,
      UPLOAD_TIMEOUT_MS,
    );
    if (!attResult.ok) {
      return handleStageFailure(draft, attResult);
    }
    syncedKeys.add(key);
    await markDraftAttachmentUploaded(draft.id, key);
  }

  // Final commit after all required stages succeed.
  await markDraftSyncCompleted(draft.id, { serverRecordingId, serverDraftId });
  emit(
    {
      activeDraftId: null,
      lastError: null,
      lastSyncAt: Date.now(),
    },
    true,
  );
  return 'completed';
}

async function drainLoop(): Promise<void> {
  outer: while (true) {
    if (!isOnline()) {
      clearBackoffTimer();
      emit({
        phase: 'paused_offline',
        isSyncing: false,
        activeDraftId: null,
        nextRetryAt: null,
      });
      rerunRequested = false;
      break;
    }

    if (!getAccessToken()) {
      clearBackoffTimer();
      emit({
        phase: 'paused_auth',
        isSyncing: false,
        activeDraftId: null,
        nextRetryAt: null,
      });
      rerunRequested = false;
      break;
    }

    const user = getSessionUser();
    if (user?.id) {
      await scopeDraftsToUser(user.id);
    }

    while (true) {
      if (!isOnline()) {
        clearBackoffTimer();
        emit({
          phase: 'paused_offline',
          isSyncing: false,
          activeDraftId: null,
          nextRetryAt: null,
        });
        rerunRequested = false;
        break outer;
      }

      if (!getAccessToken()) {
        clearBackoffTimer();
        emit({
          phase: 'paused_auth',
          isSyncing: false,
          activeDraftId: null,
          nextRetryAt: null,
        });
        rerunRequested = false;
        break outer;
      }

      const draft = await claimNextPendingDraft({
        userId: user?.id,
        leaseDurationMs: UPLOAD_LEASE_DURATION_MS,
        requireAudio: false,
      });

      if (!draft) {
        emit({
          phase: 'idle',
          isSyncing: false,
          activeDraftId: null,
        });
        break;
      }

      emit(
        {
          phase: 'syncing',
          isSyncing: true,
          activeDraftId: draft.id,
          lastError: null,
          nextRetryAt: null,
        },
        true,
      );

      const controller = new AbortController();
      activeAbortController = controller;

      try {
        const outcome = await syncClaimedDraft(draft, controller.signal);
        if (outcome === 'break_outer') {
          break outer;
        }
        continue;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed.';
        const action = await handleStageFailure(draft, { retryable: true, errorMessage: message });
        if (action === 'break_outer') {
          break outer;
        }
      } finally {
        if (activeAbortController === controller) {
          activeAbortController = null;
        }
      }
    }

    if (rerunRequested) {
      rerunRequested = false;
      continue;
    }
    break;
  }
}

export function syncPendingDrafts(options?: { manual?: boolean }): Promise<void> {
  if (options?.manual) {
    clearBackoffTimer();
    emit({ nextRetryAt: null });
  }

  if (inFlightDrain) {
    rerunRequested = true;
    return inFlightDrain;
  }

  inFlightDrain = drainLoop().finally(() => {
    inFlightDrain = null;
  });
  return inFlightDrain;
}

export function getSyncState(): SyncStateSnapshot {
  return snapshot;
}

export function subscribeSyncState(listener: (state: SyncStateSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function handleOnline(): void {
  clearBackoffTimer();
  emit({ phase: 'idle', nextRetryAt: null });
  void syncPendingDrafts();
}

function handleOffline(): void {
  clearBackoffTimer();
  rerunRequested = false;
  activeAbortController?.abort();
  emit({
    phase: 'paused_offline',
    isSyncing: false,
    nextRetryAt: null,
  });
}

function handleVisibilityChange(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    if (isOnline() && getAccessToken()) {
      void syncPendingDrafts();
    }
  }
}

function detachListeners(): void {
  if (!listenersAttached) return;
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  listenersAttached = false;
}

export function startSyncManager(): () => void {
  activeStarts += 1;
  if (!listenersAttached) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    listenersAttached = true;
  }
  void syncPendingDrafts();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    activeStarts = Math.max(0, activeStarts - 1);
    if (activeStarts === 0) {
      stopSyncManager();
    }
  };
}

export function stopSyncManager(): Promise<void> {
  activeStarts = 0;
  detachListeners();
  clearBackoffTimer();
  rerunRequested = false;
  activeAbortController?.abort();
  activeAbortController = null;
  return inFlightDrain ?? Promise.resolve();
}
