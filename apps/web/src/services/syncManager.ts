import {
  claimNextPendingDraft,
  markDraftSyncCompleted,
  markDraftSyncFailed,
} from '../features/draftStore';
import { getSessionUser } from '../api/session';
import { uploadRecording } from './uploadService';

let isSyncing = false;

export async function syncPendingDrafts(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  isSyncing = true;

  try {
    const user = getSessionUser();

    while (navigator.onLine) {
      const draft = await claimNextPendingDraft({
        userId: user?.id,
      });

      if (!draft) break;

      try {
        const result = await uploadRecording(draft);

        if (result.ok) {
          await markDraftSyncCompleted(
            draft.id,
            result.serverRecordingId ?? draft.id,
          );
        } else {
          await markDraftSyncFailed(
            draft.id,
            result.errorMessage ?? 'Upload failed',
            { revertToPending: result.networkError === true },
          );

          if (result.networkError || result.authError) break;
        }
      } catch (error) {
        await markDraftSyncFailed(
          draft.id,
          error instanceof Error ? error.message : 'Upload failed',
          { revertToPending: true },
        );

        break;
      }
    }
  } finally {
    isSyncing = false;
  }
}

export function startSyncManager(): void {
  window.addEventListener('online', syncPendingDrafts);
  void syncPendingDrafts();
}

export function stopSyncManager(): void {
  window.removeEventListener('online', syncPendingDrafts);
}