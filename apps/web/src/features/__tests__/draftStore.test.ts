import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DraftStorageError,
  claimNextPendingDraft,
  deleteDraft,
  getDraftAttachmentKey,
  getDraftById,
  getDrafts,
  getStorageQuotaStatus,
  listDraftSummaries,
  markDraftAttachmentUploaded,
  markDraftAudioUploaded,
  markDraftServerSynced,
  markDraftSyncCompleted,
  markDraftSyncFailed,
  retryFailedDraft,
  saveDraft,
  scopeDraftsToUser,
  type SaveDraftInput,
} from '../draftStore';

const DB_NAME = 'workshop-note';
const STORE_NAME = 'drafts';
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deleteWorkshopDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeBaseDraft(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    date: '2026-11-27T08:00:00.000Z',
    observation: 'High-pitched bearing whine on slurry pump',
    equipment: 'Centrifugal Slurry Pump P-104',
    subsystem: 'Drive-end bearing',
    symptom: 'Abnormal high-frequency noise',
    cause: 'Suspected lubrication starvation',
    action: 'Checked sight glass oil level',
    parts: '',
    safety: 'PPE + ear protection verified',
    mode: 'Voice',
    duration: 12_500,
    attachments: [],
    syncStatus: 'pending',
    ...overrides,
  };
}

function readRawStoreRecord(id: string): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get(id);
      let result: Record<string, unknown> | undefined;
      getReq.onsuccess = () => {
        result = getReq.result as Record<string, unknown> | undefined;
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

function seedLegacyV1Database(records: Array<Record<string, unknown>>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const rec of records) {
        store.put(rec);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

describe('US-03 Offline Audio Storage (draftStore v2)', () => {
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');

  beforeEach(async () => {
    await deleteWorkshopDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalStorageDescriptor) {
      Object.defineProperty(globalThis.navigator, 'storage', originalStorageDescriptor);
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'storage');
    }
    await deleteWorkshopDb();
  });

  it('AC-1, AC-3, AC-4: saves voice draft with generated UUID v4, pending status, attachment, and full metadata', async () => {
    const audioBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const audioBlob = new Blob([audioBytes], { type: 'audio/webm' });
    const attachmentBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const attachmentBlob = new Blob([attachmentBytes], { type: 'image/jpeg' });
    const recordedAt = '2026-11-27T08:15:30.000Z';

    const input = makeBaseDraft({
      recordedAt,
      duration: 14_250,
      durationMs: 14_250,
      audio: audioBlob,
      audioType: 'audio/webm',
      userId: 'tech-user-01',
      attachments: [
        {
          name: 'bearing-housing.jpg',
          type: 'image/jpeg',
          size: attachmentBytes.byteLength,
          blob: attachmentBlob,
        },
      ],
      // Omit id and pass legacy 'local' to verify auto-UUID and normalization to 'pending'
      syncStatus: 'local',
    });

    await saveDraft(input);

    const drafts = await getDrafts('tech-user-01');
    expect(drafts).toHaveLength(1);

    const saved = drafts[0];
    expect(saved.id).toMatch(UUID_V4_REGEX);
    expect(saved.syncStatus).toBe('pending');
    expect(saved.userId).toBe('tech-user-01');
    expect(saved.durationMs).toBe(14_250);
    expect(saved.duration).toBe(14_250);
    expect(saved.recordedAt).toBe(recordedAt);
    expect(saved.audioMimeType).toBe('audio/webm');
    expect(saved.audioSizeBytes).toBe(audioBytes.byteLength);
    expect(saved.retryCount).toBe(0);
    expect(typeof saved.createdAt).toBe('number');
    expect(typeof saved.updatedAt).toBe('number');
    expect(saved.attachments).toHaveLength(1);
    expect(saved.attachments[0].name).toBe('bearing-housing.jpg');
    expect(saved.attachments[0].size).toBe(attachmentBytes.byteLength);

    // Metadata-only summary query omits binary Blobs/ArrayBuffers
    const summaries = await listDraftSummaries('tech-user-01');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe(saved.id);
    expect(summaries[0].hasAudio).toBe(true);
    expect(summaries[0].audioSizeBytes).toBe(audioBytes.byteLength);
    expect('audio' in summaries[0]).toBe(false);
    expect(summaries[0].attachments).toEqual([
      { name: 'bearing-housing.jpg', type: 'image/jpeg', size: attachmentBytes.byteLength },
    ]);
  });

  it('AC-2: persists across DB reopen and reconstructs audio + attachment Blobs byte-for-byte from ArrayBuffers', async () => {
    const originalAudioBytes = new Uint8Array(1024);
    for (let i = 0; i < originalAudioBytes.length; i += 1) {
      originalAudioBytes[i] = (i * 31 + 7) & 0xff;
    }
    const originalAttachmentBytes = new Uint8Array([11, 22, 33, 44, 55, 66, 77, 88]);
    const draftId = crypto.randomUUID();

    await saveDraft(
      makeBaseDraft({
        id: draftId,
        audio: new Blob([originalAudioBytes], { type: 'audio/ogg' }),
        audioType: 'audio/ogg',
        attachments: [
          {
            name: 'gauge-reading.png',
            type: 'image/png',
            size: originalAttachmentBytes.byteLength,
            blob: new Blob([originalAttachmentBytes], { type: 'image/png' }),
          },
        ],
      }),
    );

    // Inspect raw stored record to verify WebKit-safe ArrayBuffer persistence (no raw Blob stored)
    const raw = await readRawStoreRecord(draftId);
    expect(raw).toBeDefined();
    expect(raw?.audioBuffer).toBeInstanceOf(ArrayBuffer);
    expect(raw?.audio).toBeUndefined();
    const rawAttachments = raw?.attachments as Array<Record<string, unknown>>;
    expect(rawAttachments[0].buffer).toBeInstanceOf(ArrayBuffer);
    expect(rawAttachments[0].blob).toBeUndefined();

    // Re-read via fresh DB connections (getDraftById + getDrafts)
    const byId = await getDraftById(draftId);
    expect(byId).not.toBeNull();
    expect(byId?.audio).toBeInstanceOf(Blob);
    expect(byId?.audio?.type).toBe('audio/ogg');

    const restoredAudioBytes = new Uint8Array(await byId!.audio!.arrayBuffer());
    expect(restoredAudioBytes).toEqual(originalAudioBytes);

    const restoredAttachmentBytes = new Uint8Array(await byId!.attachments[0].blob.arrayBuffer());
    expect(restoredAttachmentBytes).toEqual(originalAttachmentBytes);

    const all = await getDrafts();
    expect(all).toHaveLength(1);
    const allAudioBytes = new Uint8Array(await all[0].audio!.arrayBuffer());
    expect(allAudioBytes).toEqual(originalAudioBytes);
  });

  it('v1 -> v2 migration: preserves legacy v1 records, converts syncStatus "local" -> "pending", and backfills metadata', async () => {
    const legacyAudioBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const legacyAttachmentBytes = new Uint8Array([60, 70, 80]);

    await seedLegacyV1Database([
      {
        id: 'legacy-v1-case',
        date: '2026-10-15T14:20:00.000Z',
        observation: 'Coolant pump seal weeping at 3 bar',
        equipment: 'Coolant Pump C-12',
        subsystem: 'Mechanical seal',
        symptom: 'Minor fluid drip',
        cause: 'Worn seal face',
        action: 'Logged for shift inspection',
        parts: 'Seal kit #4',
        safety: 'Contain coolant drip',
        mode: 'Voice',
        duration: 9_200,
        audio: new Blob([legacyAudioBytes], { type: 'audio/ogg' }),
        audioType: 'audio/ogg',
        attachments: [
          {
            name: 'seal-photo.jpg',
            type: 'image/jpeg',
            size: legacyAttachmentBytes.byteLength,
            blob: new Blob([legacyAttachmentBytes], { type: 'image/jpeg' }),
          },
        ],
        syncStatus: 'local',
      },
    ]);

    const migrated = await getDraftById('legacy-v1-case');
    expect(migrated).not.toBeNull();
    expect(migrated?.syncStatus).toBe('pending');
    expect(migrated?.retryCount).toBe(0);
    expect(migrated?.recordedAt).toBe('2026-10-15T14:20:00.000Z');
    expect(typeof migrated?.createdAt).toBe('number');
    expect(typeof migrated?.updatedAt).toBe('number');
    expect(migrated?.observation).toBe('Coolant pump seal weeping at 3 bar');
    expect(migrated?.equipment).toBe('Coolant Pump C-12');
    expect(migrated?.audio).toBeInstanceOf(Blob);
    expect(new Uint8Array(await migrated!.audio!.arrayBuffer())).toEqual(legacyAudioBytes);
    expect(new Uint8Array(await migrated!.attachments[0].blob.arrayBuffer())).toEqual(legacyAttachmentBytes);

    // Ensure v2 composite index can claim the migrated record
    const claimed = await claimNextPendingDraft();
    expect(claimed?.id).toBe('legacy-v1-case');
    expect(claimed?.syncStatus).toBe('uploading');
    expect(claimed?.retryCount).toBe(1);
  });

  it('AC-5: rejects 0-byte audio with INVALID_AUDIO and enforces storage quota with QUOTA_EXCEEDED', async () => {
    const emptyAudio = new Blob([], { type: 'audio/webm' });

    let invalidErr: unknown;
    try {
      await saveDraft(makeBaseDraft({ audio: emptyAudio, audioType: 'audio/webm' }));
    } catch (error) {
      invalidErr = error;
    }
    expect(invalidErr).toBeInstanceOf(DraftStorageError);
    expect((invalidErr as DraftStorageError).code).toBe('INVALID_AUDIO');
    expect((invalidErr as DraftStorageError).userMessage.length).toBeGreaterThan(0);
    expect(await getDrafts()).toHaveLength(0);

    // Mock navigator.storage near full: 1000 quota, 950 used (50 remaining < 100 * 1.5 headroom)
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 950 }),
        persist: vi.fn().mockResolvedValue(true),
        persisted: vi.fn().mockResolvedValue(true),
      },
    });

    const quotaStatus = await getStorageQuotaStatus();
    expect(quotaStatus).toEqual({
      usageBytes: 950,
      quotaBytes: 1000,
      percentUsed: 95,
      isPersisted: true,
    });

    let quotaErr: unknown;
    try {
      await saveDraft(
        makeBaseDraft({
          audio: new Blob([new Uint8Array(100)], { type: 'audio/webm' }),
          audioType: 'audio/webm',
        }),
      );
    } catch (error) {
      quotaErr = error;
    }
    expect(quotaErr).toBeInstanceOf(DraftStorageError);
    expect((quotaErr as DraftStorageError).code).toBe('QUOTA_EXCEEDED');
    expect((quotaErr as DraftStorageError).userMessage.length).toBeGreaterThan(0);
    expect(await getDrafts()).toHaveLength(0);
  });

  it('Concurrency & flapping Wi-Fi: concurrent claimNextPendingDraft calls claim a single pending draft exactly once in FIFO order', async () => {
    const olderId = crypto.randomUUID();
    const newerId = crypto.randomUUID();

    await saveDraft(
      makeBaseDraft({
        id: olderId,
        date: '2026-11-27T07:00:00.000Z',
        createdAt: 1_700_000_000_000,
      }),
    );

    const singleResults = await Promise.all([
      claimNextPendingDraft(),
      claimNextPendingDraft(),
      claimNextPendingDraft(),
      claimNextPendingDraft(),
      claimNextPendingDraft(),
    ]);

    const claimed = singleResults.filter((item) => item !== null);
    const nulls = singleResults.filter((item) => item === null);

    expect(claimed).toHaveLength(1);
    expect(nulls).toHaveLength(4);
    expect(claimed[0]?.id).toBe(olderId);
    expect(claimed[0]?.syncStatus).toBe('uploading');
    expect(claimed[0]?.retryCount).toBe(1);
    expect(typeof claimed[0]?.lastAttemptAt).toBe('number');

    const persistedClaim = await getDraftById(olderId);
    expect(persistedClaim?.syncStatus).toBe('uploading');
    expect(persistedClaim?.retryCount).toBe(1);

    // Verify FIFO ordering across multiple pending drafts
    await markDraftSyncCompleted(olderId, 'srv-old');
    await saveDraft(
      makeBaseDraft({
        id: newerId,
        date: '2026-11-27T09:00:00.000Z',
        createdAt: 1_700_000_200_000,
      }),
    );
    const thirdId = crypto.randomUUID();
    await saveDraft(
      makeBaseDraft({
        id: thirdId,
        date: '2026-11-27T08:00:00.000Z',
        createdAt: 1_700_000_100_000,
      }),
    );

    const firstFifo = await claimNextPendingDraft();
    const secondFifo = await claimNextPendingDraft();
    expect(firstFifo?.id).toBe(thirdId);
    expect(secondFifo?.id).toBe(newerId);
  });

  it('Stale lease recovery, 401 rollback, failure retry, completion, and deletion lifecycle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T10:00:00.000Z'));

    const draftId = crypto.randomUUID();
    await saveDraft(
      makeBaseDraft({
        id: draftId,
        userId: 'tech-user-99',
        audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' }),
      }),
    );

    // 1. Claim initially
    const initialClaim = await claimNextPendingDraft({ userId: 'tech-user-99', leaseDurationMs: 30_000 });
    expect(initialClaim?.id).toBe(draftId);
    expect(initialClaim?.syncStatus).toBe('uploading');
    expect(initialClaim?.retryCount).toBe(1);

    // Before lease expires, another worker gets null
    vi.advanceTimersByTime(10_000);
    expect(await claimNextPendingDraft({ userId: 'tech-user-99', leaseDurationMs: 30_000 })).toBeNull();

    // 2. After lease expires (> 30s), stale 'uploading' record is reclaimed
    vi.advanceTimersByTime(25_000);
    const reclaimed = await claimNextPendingDraft({ userId: 'tech-user-99', leaseDurationMs: 30_000 });
    expect(reclaimed?.id).toBe(draftId);
    expect(reclaimed?.syncStatus).toBe('uploading');
    expect(reclaimed?.retryCount).toBe(2);

    // 3. 401 rollback preserves retry budget (revertToPending: true)
    await markDraftSyncFailed(draftId, 'Unauthorized', { revertToPending: true });
    const after401 = await getDraftById(draftId);
    expect(after401?.syncStatus).toBe('pending');
    expect(after401?.retryCount).toBe(1);
    expect(after401?.lastError).toBe('Unauthorized');

    // 4. Permanent failure (revertToPending: false) & manual retryFailedDraft
    const reClaimedAfter401 = await claimNextPendingDraft({ userId: 'tech-user-99' });
    expect(reClaimedAfter401?.retryCount).toBe(2);

    await markDraftSyncFailed(draftId, 'Server rejected payload', { revertToPending: false });
    const failed = await getDraftById(draftId);
    expect(failed?.syncStatus).toBe('failed');
    expect(failed?.lastError).toBe('Server rejected payload');
    expect(await claimNextPendingDraft({ userId: 'tech-user-99' })).toBeNull();

    await retryFailedDraft(draftId);
    const reset = await getDraftById(draftId);
    expect(reset?.syncStatus).toBe('pending');
    expect(reset?.retryCount).toBe(0);
    expect(reset?.lastError).toBeUndefined();

    // 5. Successful completion & delete
    const finalClaim = await claimNextPendingDraft({ userId: 'tech-user-99' });
    expect(finalClaim?.id).toBe(draftId);
    await markDraftSyncCompleted(draftId, 'server-rec-12345');

    const completed = await getDraftById(draftId);
    expect(completed?.syncStatus).toBe('completed');
    expect(completed?.serverRecordingId).toBe('server-rec-12345');
    expect(completed?.lastError).toBeUndefined();

    await deleteDraft(draftId);
    expect(await getDraftById(draftId)).toBeNull();
  });

  it('Checkpointed sync helpers persist partial stage progress and scopeDraftsToUser binds pre-login drafts', async () => {
    const preLoginId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();

    await saveDraft(
      makeBaseDraft({
        id: preLoginId,
        userId: undefined,
        audio: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
        attachments: [
          {
            name: 'photo.jpg',
            type: 'image/jpeg',
            size: 2,
            blob: new Blob([new Uint8Array([9, 8])], { type: 'image/jpeg' }),
          },
        ],
      }),
    );
    await saveDraft(
      makeBaseDraft({
        id: otherUserId,
        userId: 'other-user',
        audio: undefined,
      }),
    );

    const boundCount = await scopeDraftsToUser('active-tech-1');
    expect(boundCount).toBe(1);
    expect((await getDraftById(preLoginId))?.userId).toBe('active-tech-1');
    expect((await getDraftById(otherUserId))?.userId).toBe('other-user');

    const claimed = await claimNextPendingDraft({ userId: 'active-tech-1', requireAudio: false });
    expect(claimed?.id).toBe(preLoginId);

    await markDraftAudioUploaded(preLoginId, 'srv-rec-ckpt');
    let mid = await getDraftById(preLoginId);
    expect(mid?.syncStatus).toBe('uploading');
    expect(mid?.serverRecordingId).toBe('srv-rec-ckpt');

    await markDraftServerSynced(preLoginId, 'srv-draft-ckpt');
    mid = await getDraftById(preLoginId);
    expect(mid?.syncStatus).toBe('uploading');
    expect(mid?.serverDraftId).toBe('srv-draft-ckpt');

    const attKey = getDraftAttachmentKey(preLoginId, 0, mid!.attachments[0]);
    await markDraftAttachmentUploaded(preLoginId, attKey);
    await markDraftAttachmentUploaded(preLoginId, attKey); // idempotent duplicate
    mid = await getDraftById(preLoginId);
    expect(mid?.syncedAttachmentKeys).toEqual([attKey]);

    await markDraftSyncCompleted(preLoginId, {
      serverRecordingId: 'srv-rec-ckpt',
      serverDraftId: 'srv-draft-ckpt',
    });
    const done = await getDraftById(preLoginId);
    expect(done?.syncStatus).toBe('completed');
    expect(done?.serverRecordingId).toBe('srv-rec-ckpt');
    expect(done?.serverDraftId).toBe('srv-draft-ckpt');
  });
});
