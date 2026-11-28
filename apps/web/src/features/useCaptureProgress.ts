import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '../api/session';
import { getServerRecordingState, processServerRecordingRequest, type ServerRecordingState } from '../api/drafts';
import { getDraftById, retryFailedDraft } from './draftStore';
import {
  buildCaptureSteps,
  buildPipelineSnapshotFromRecording,
  isCaptureSettled,
  type CaptureStepInput,
} from './pipelineStatus';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncPendingDrafts } from '../services/syncManager';

const FAST_POLL_MS = 2_500;
const SLOW_POLL_MS = 10_000;
const SLOW_AFTER_MS = 2 * 60_000;
/** AUTO_PROCESS normally starts transcription within moments of upload; if still RECEIVED after this, ask the API to start it. */
const KICK_AFTER_MS = 8_000;

/**
 * Follows ONE just-saved observation from the device to the finished extraction using real data only:
 *   - device state (saved / uploading / failed / uploaded) comes from the IndexedDB draft written by the sync manager;
 *   - transcription and extraction state, transcript text and extracted fields come from GET /api/v1/recordings/:id.
 * Nothing advances on a timer. Polling stops once processing is finished, failed (needs a retry) or offline-paused.
 */
export function useCaptureProgress(draftId: string, hasAudio: boolean) {
  const online = useNetworkStatus();
  const [local, setLocal] = useState<CaptureStepInput['local']>(null);
  const [server, setServer] = useState<ServerRecordingState | null>(null);
  const [settled, setSettled] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [processError, setProcessError] = useState<string | undefined>();
  const [serverReadError, setServerReadError] = useState<string | null>(null);

  const serverRef = useRef<ServerRecordingState | null>(null);
  const receivedSinceRef = useRef<number | null>(null);
  const kickedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const startedAt = Date.now();
    setSettled(false);

    const poll = async () => {
      let nextLocal: CaptureStepInput['local'] = null;
      try {
        const d = await getDraftById(draftId);
        if (d) nextLocal = { syncStatus: d.syncStatus, serverRecordingId: d.serverRecordingId, lastError: d.lastError };
      } catch {
        /* device storage unreadable: keep the previous local snapshot */
      }
      if (cancelled) return;
      if (nextLocal) setLocal(nextLocal);

      const recordingId = nextLocal?.serverRecordingId;
      if (hasAudio && recordingId && navigator.onLine && getAccessToken()) {
        try {
          const state = await getServerRecordingState(recordingId, controller.signal);
          if (cancelled) return;
          serverRef.current = state;
          setServer(state);
          setServerReadError(null);

          // Manual-processing mode (AUTO_PROCESS=false) or a missed trigger: start the pipeline through the existing API once.
          if (state.recording.status === 'RECEIVED') {
            receivedSinceRef.current ??= Date.now();
            if (!kickedRef.current && Date.now() - receivedSinceRef.current > KICK_AFTER_MS) {
              kickedRef.current = true;
              void processServerRecordingRequest(recordingId);
            }
          } else {
            receivedSinceRef.current = null;
          }
        } catch (error) {
          if (cancelled) return;
          // Keep showing the last real server state; just tell the user we could not refresh it.
          setServerReadError(error instanceof Error ? error.message : 'Could not read the server status.');
        }
      }

      const input: CaptureStepInput = { hasAudio, online: navigator.onLine, local: nextLocal ?? null, server: serverRef.current };
      if (isCaptureSettled(input)) {
        setSettled(true);
        return;
      }
      const delay = Date.now() - startedAt > SLOW_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS;
      timer = setTimeout(() => void poll(), delay);
    };

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [draftId, hasAudio, restartKey]);

  // Coming back online while the device still holds un-uploaded audio: resume polling (the sync manager does the upload).
  useEffect(() => {
    if (online && settled && hasAudio && local && !local.serverRecordingId && local.syncStatus !== 'failed') {
      setRestartKey((k) => k + 1);
    }
  }, [online, settled, hasAudio, local]);

  const refresh = useCallback(() => {
    kickedRef.current = false;
    setRestartKey((k) => k + 1);
  }, []);

  /** Upload failed on the device side (not a transcription/extraction problem): reset the draft and sync again. */
  const retryUpload = useCallback(async () => {
    await retryFailedDraft(draftId);
    void syncPendingDrafts({ manual: true });
    refresh();
  }, [draftId, refresh]);

  /** Server-side processing failed (transcription or extraction): ask the backend to resume from where it stopped. */
  const retryProcessing = useCallback(async () => {
    const recordingId = serverRef.current?.recording.id ?? local?.serverRecordingId;
    if (!recordingId) return;
    setRetrying(true);
    setProcessError(undefined);
    const outcome = await processServerRecordingRequest(recordingId);
    setRetrying(false);
    if (!outcome.ok) {
      setProcessError(
        outcome.authError ? 'Your session expired. Sign in again to retry.' : (outcome.errorMessage ?? 'Could not restart processing. Please try again.'),
      );
    }
    refresh();
  }, [local?.serverRecordingId, refresh]);

  const steps = useMemo(
    () => buildCaptureSteps({ hasAudio, online, local, server }),
    [hasAudio, online, local, server],
  );
  const snapshot = useMemo(() => (server ? buildPipelineSnapshotFromRecording(server) : null), [server]);

  return { steps, snapshot, online, settled, retrying, processError, serverReadError, retryUpload, retryProcessing, refresh };
}
