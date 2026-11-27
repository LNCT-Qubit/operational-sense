import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  getSyncState,
  startSyncManager,
  subscribeSyncState,
  syncPendingDrafts,
  type SyncStateSnapshot,
} from '../services/syncManager';

export function useSyncStatus(): {
  syncState: SyncStateSnapshot;
  triggerSync: () => Promise<void>;
} {
  const syncState = useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);

  useEffect(() => {
    const stop = startSyncManager();
    return () => {
      stop();
    };
  }, []);

  const triggerSync = useCallback(() => syncPendingDrafts({ manual: true }), []);

  return { syncState, triggerSync };
}
