import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../api/session';
import {
  claimNextPendingDraft,
  getDraftAttachmentKey,
  getDraftById,
  retryFailedDraft,
  saveDraft,
  type SaveDraftInput,
} from '../../features/draftStore';
import {
  MAX_SYNC_RETRIES,
  UPLOAD_LEASE_DURATION_MS,
  getSyncState,
  startSyncManager,
  stopSyncManager,
  syncPendingDrafts,
} from '../syncManager';
import { UPLOAD_TIMEOUT_MS } from '../uploadService';

const DB_NAME = 'workshop-note';

function deleteWorkshopDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeVoiceDraft(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    id: crypto.randomUUID(),
    date: '2026-11-27T08:00:00.000Z',
    recordedAt: '2026-11-27T08:00:00.000Z',
    observation: 'Bearing vibration detected',
    equipment: 'Pump P-101',
    subsystem: 'Drive-end bearing',
    symptom: 'High vibration',
    cause: 'Misalignment',
    action: 'Checked coupling',
    parts: 'Seal #12',
    safety: 'LOTO applied',
    mode: 'Voice',
    duration: 12_500,
    durationMs: 12_500,
    userId: 'tech-user-1',
    audio: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], {
      type: 'audio/webm;codecs=opus',
    }),
    audioType: 'audio/webm;codecs=opus',
    audioMimeType: 'audio/webm;codecs=opus',
    attachments: [
      {
        name: 'pump.jpg',
        type: 'image/jpeg',
        size: 3,
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      },
    ],
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeTextDraft(overrides: Partial<SaveDraftInput> = {}): SaveDraftInput {
  return {
    id: crypto.randomUUID(),
    date: '2026-11-27T07:00:00.000Z',
    recordedAt: '2026-11-27T07:00:00.000Z',
    observation: 'Text-only inspection note',
    equipment: 'Valve V-10',
    subsystem: 'Actuator',
    symptom: 'Sticking stem',
    cause: 'Scale buildup',
    action: 'Cleaned stem',
    parts: 'Packing ring',
    safety: 'Isolation confirmed',
    mode: 'Text',
    duration: 0,
    durationMs: 0,
    userId: 'tech-user-1',
    attachments: [],
    syncStatus: 'pending',
    ...overrides,
  };
}

function setOnlineState(online: boolean): void {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

function signInTechnician(userId = 'tech-user-1'): void {
  setSession({
    accessToken: 'jwt-token-in-memory',
    expiresAt: Date.now() + 3_600_000,
    user: {
      id: userId,
      name: 'Alex Tech',
      email: 'alex@example.com',
      role: 'TECHNICIAN',
    },
  });
}

function mockJsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

describe('US-04 Checkpointed 3-Stage Sync & US-03 Handshake', () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await stopSyncManager();
    clearSession();
    setOnlineState(true);
    await deleteWorkshopDb();
  });

  afterEach(async () => {
    await stopSyncManager();
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearSession();
    globalThis.fetch = originalFetch;
    if (originalOnLineDescriptor) {
      Object.defineProperty(globalThis.navigator, 'onLine', originalOnLineDescriptor);
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'onLine');
    }
    await deleteWorkshopDb();
  });

  it('syncs voice + attachment drafts across all 3 stages in FIFO order and preserves local data', async () => {
    signInTechnician();
    expect(UPLOAD_TIMEOUT_MS).toBeLessThan(UPLOAD_LEASE_DURATION_MS);

    const olderId = crypto.randomUUID();
    const newerId = crypto.randomUUID();

    await saveDraft(
      makeVoiceDraft({
        id: newerId,
        createdAt: 1_700_000_200_000,
        recordedAt: '2026-11-27T09:00:00.000Z',
        durationMs: 8_400,
      }),
    );
    await saveDraft(
      makeVoiceDraft({
        id: olderId,
        createdAt: 1_700_000_100_000,
        recordedAt: '2026-11-27T08:00:00.000Z',
        durationMs: 14_250.4,
      }),
    );

    const capturedCalls: Array<{ url: string; init: RequestInit }> = [];
    let recSeq = 0;
    let draftSeq = 0;
    let attSeq = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      capturedCalls.push({ url, init: init ?? {} });
      if (url === '/api/v1/recordings') {
        recSeq += 1;
        return mockJsonResponse(201, { duplicate: false, recording: { id: `srv-rec-${recSeq}` } });
      }
      if (url === '/api/v1/drafts') {
        draftSeq += 1;
        return mockJsonResponse(201, { duplicate: false, draft: { id: `srv-draft-${draftSeq}` } });
      }
      if (url.endsWith('/attachments')) {
        attSeq += 1;
        return mockJsonResponse(201, { duplicate: false, attachment: { id: `srv-att-${attSeq}` } });
      }
      return mockJsonResponse(404, {});
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(capturedCalls.map((c) => c.url)).toEqual([
      '/api/v1/recordings',
      '/api/v1/drafts',
      '/api/v1/drafts/srv-draft-1/attachments',
      '/api/v1/recordings',
      '/api/v1/drafts',
      '/api/v1/drafts/srv-draft-2/attachments',
    ]);

    expect(capturedCalls[0].init.headers).toEqual({
      Authorization: 'Bearer jwt-token-in-memory',
      'Idempotency-Key': olderId,
      'Content-Type': 'audio/webm;codecs=opus',
      'X-Duration-Ms': '14250',
      'X-Recorded-At': '2026-11-27T08:00:00.000Z',
    });

    const draftReqBody = JSON.parse(String(capturedCalls[1].init.body));
    expect(draftReqBody).toMatchObject({
      clientDraftId: olderId,
      recordingId: 'srv-rec-1',
      captureMode: 'voice',
      equipment: 'Pump P-101',
      observation: 'Bearing vibration detected',
    });

    const attHeaders = new Headers(capturedCalls[2].init.headers);
    expect(attHeaders.get('X-File-Name')).toBe('pump.jpg');
    expect(attHeaders.get('Idempotency-Key')).toBe(
      getDraftAttachmentKey(olderId, 0, { name: 'pump.jpg', size: 3 }),
    );

    const firstSaved = await getDraftById(olderId);
    const secondSaved = await getDraftById(newerId);
    expect(firstSaved?.syncStatus).toBe('completed');
    expect(firstSaved?.serverRecordingId).toBe('srv-rec-1');
    expect(firstSaved?.serverDraftId).toBe('srv-draft-1');
    expect(firstSaved?.syncedAttachmentKeys).toHaveLength(1);
    expect(firstSaved?.attachments).toHaveLength(1);
    expect(secondSaved?.syncStatus).toBe('completed');
    expect(secondSaved?.serverRecordingId).toBe('srv-rec-2');
    expect(secondSaved?.serverDraftId).toBe('srv-draft-2');
    expect(getSyncState().phase).toBe('idle');
  });

  it('checkpoint recovery: skips Stage 1 audio upload on retry after Stage 2 503 failure', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    signInTechnician();

    const draftId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId }));

    let recordingCalls = 0;
    let draftCalls = 0;
    let attachmentCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/recordings') {
        recordingCalls += 1;
        return mockJsonResponse(201, { duplicate: false, recording: { id: 'srv-rec-once' } });
      }
      if (url === '/api/v1/drafts') {
        draftCalls += 1;
        if (draftCalls === 1) {
          return mockJsonResponse(503, { error: { code: 'DATABASE_UNAVAILABLE' } });
        }
        const body = JSON.parse(String(init?.body));
        expect(body.recordingId).toBe('srv-rec-once');
        return mockJsonResponse(201, { duplicate: false, draft: { id: 'srv-draft-ok' } });
      }
      if (url.endsWith('/attachments')) {
        attachmentCalls += 1;
        return mockJsonResponse(201, { duplicate: false, attachment: { id: 'srv-att-1' } });
      }
      return mockJsonResponse(404, {});
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();
    expect(recordingCalls).toBe(1);
    expect(draftCalls).toBe(1);
    expect(attachmentCalls).toBe(0);

    const mid = await getDraftById(draftId);
    expect(mid?.syncStatus).toBe('pending');
    expect(mid?.serverRecordingId).toBe('srv-rec-once');
    expect(mid?.serverDraftId).toBeUndefined();

    // Backoff timer fires and retries ONLY Stage 2 + Stage 3 (recordingCalls stays 1!)
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(attachmentCalls).toBe(1));
    await vi.waitFor(() => expect(getSyncState().isSyncing).toBe(false));

    expect(recordingCalls).toBe(1);
    expect(draftCalls).toBe(2);
    const done = await getDraftById(draftId);
    expect(done?.syncStatus).toBe('completed');
    expect(done?.serverRecordingId).toBe('srv-rec-once');
    expect(done?.serverDraftId).toBe('srv-draft-ok');
  });

  it('syncs text-only drafts straight to POST /api/v1/drafts with 0 calls to /api/v1/recordings', async () => {
    signInTechnician();
    const textDraftId = crypto.randomUUID();
    await saveDraft(makeTextDraft({ id: textDraftId }));

    const urls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      const body = JSON.parse(String(init?.body));
      expect(body.captureMode).toBe('text');
      expect(body.recordingId).toBeNull();
      return mockJsonResponse(201, { duplicate: false, draft: { id: 'srv-text-1' } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(urls).toEqual(['/api/v1/drafts']);
    const persisted = await getDraftById(textDraftId);
    expect(persisted?.syncStatus).toBe('completed');
    expect(persisted?.serverDraftId).toBe('srv-text-1');
    expect(persisted?.serverRecordingId).toBeUndefined();

    // claimNextPendingDraft still honors requireAudio: true if explicitly requested
    await saveDraft(makeTextDraft());
    expect(await claimNextPendingDraft({ userId: 'tech-user-1', requireAudio: true })).toBeNull();
  });

  it('binds pre-login drafts (userId === undefined) via scopeDraftsToUser and syncs them once signed in', async () => {
    const preLoginId = crypto.randomUUID();
    await saveDraft(makeTextDraft({ id: preLoginId, userId: undefined }));

    // Signed out -> paused_auth, untouched
    const fetchMock = vi.fn(async () =>
      mockJsonResponse(201, { duplicate: false, draft: { id: 'srv-prelogin-1' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().phase).toBe('paused_auth');

    // Sign in -> scopeDraftsToUser binds preLoginId -> sync completes
    signInTechnician('tech-user-99');
    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const persisted = await getDraftById(preLoginId);
    expect(persisted?.userId).toBe('tech-user-99');
    expect(persisted?.syncStatus).toBe('completed');
    expect(persisted?.serverDraftId).toBe('srv-prelogin-1');
  });

  it('checks navigator.onLine and access token before claiming so retryCount is never incremented', async () => {
    const draftId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId }));

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().phase).toBe('paused_auth');
    let persisted = await getDraftById(draftId);
    expect(persisted?.syncStatus).toBe('pending');
    expect(persisted?.retryCount).toBe(0);

    signInTechnician();
    setOnlineState(false);
    await syncPendingDrafts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().phase).toBe('paused_offline');
    persisted = await getDraftById(draftId);
    expect(persisted?.syncStatus).toBe('pending');
    expect(persisted?.retryCount).toBe(0);
  });

  it('coalesces concurrent triggers via single-flight mutex and rerunRequested', async () => {
    signInTechnician();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await saveDraft(makeTextDraft({ id: firstId, createdAt: 1_700_000_100_000 }));

    let activeFetches = 0;
    let maxConcurrentFetches = 0;
    let releaseFirstFetch!: () => void;
    const firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    let callCount = 0;

    const fetchMock = vi.fn(async () => {
      callCount += 1;
      activeFetches += 1;
      maxConcurrentFetches = Math.max(maxConcurrentFetches, activeFetches);
      try {
        if (callCount === 1) {
          await firstFetchGate;
        }
        return mockJsonResponse(201, { duplicate: false, draft: { id: `srv-d-${callCount}` } });
      } finally {
        activeFetches -= 1;
      }
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const p1 = syncPendingDrafts();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await saveDraft(makeTextDraft({ id: secondId, createdAt: 1_700_000_200_000 }));
    const p2 = syncPendingDrafts();
    const p3 = syncPendingDrafts();
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);

    releaseFirstFetch();
    await p1;

    expect(maxConcurrentFetches).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await getDraftById(firstId))?.syncStatus).toBe('completed');
    expect((await getDraftById(secondId))?.syncStatus).toBe('completed');
  });

  it('rolls back to pending without consuming retry budget and halts loop on 401', async () => {
    signInTechnician();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: firstId, createdAt: 1_700_000_100_000 }));
    await saveDraft(makeVoiceDraft({ id: secondId, createdAt: 1_700_000_200_000 }));

    const fetchMock = vi.fn(async () => mockJsonResponse(401, { error: { code: 'UNAUTHORIZED' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSyncState().phase).toBe('paused_auth');

    const first = await getDraftById(firstId);
    const second = await getDraftById(secondId);
    expect(first?.syncStatus).toBe('pending');
    expect(first?.retryCount).toBe(0);
    expect(first?.lastError).toContain('Authentication expired');
    expect(second?.syncStatus).toBe('pending');
    expect(second?.retryCount).toBe(0);
  });

  it('isolates permanent 415 and 413 failures and continues syncing subsequent drafts', async () => {
    signInTechnician();
    const badMimeId = crypto.randomUUID();
    const tooLargeId = crypto.randomUUID();
    const validId = crypto.randomUUID();

    await saveDraft(makeVoiceDraft({ id: badMimeId, createdAt: 1_700_000_100_000 }));
    await saveDraft(makeVoiceDraft({ id: tooLargeId, createdAt: 1_700_000_200_000 }));
    await saveDraft(makeVoiceDraft({ id: validId, createdAt: 1_700_000_300_000, attachments: [] }));

    let recCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/recordings') {
        recCall += 1;
        if (recCall === 1) return mockJsonResponse(415, { error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
        if (recCall === 2) return mockJsonResponse(413, { error: { code: 'PAYLOAD_TOO_LARGE' } });
        return mockJsonResponse(201, { duplicate: false, recording: { id: 'srv-ok' } });
      }
      return mockJsonResponse(201, { duplicate: false, draft: { id: 'srv-draft-ok' } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(recCall).toBe(3);
    const badMime = await getDraftById(badMimeId);
    const tooLarge = await getDraftById(tooLargeId);
    const valid = await getDraftById(validId);

    expect(badMime?.syncStatus).toBe('failed');
    expect(badMime?.lastError).toContain('415');
    expect(tooLarge?.syncStatus).toBe('failed');
    expect(tooLarge?.lastError).toContain('413');
    expect(valid?.syncStatus).toBe('completed');
    expect(valid?.serverRecordingId).toBe('srv-ok');
    expect(valid?.serverDraftId).toBe('srv-draft-ok');
  });

  it('handles 503 backoff, Retry-After on 429, retry cap (>= 5 -> failed), and manual retryFailedDraft', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    signInTechnician();

    const draftId = crypto.randomUUID();
    const queuedSecondId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId, createdAt: 1_700_000_100_000, attachments: [] }));
    await saveDraft(makeVoiceDraft({ id: queuedSecondId, createdAt: 1_700_000_200_000, attachments: [] }));

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => mockJsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSyncState().phase).toBe('backoff');
    let first = await getDraftById(draftId);
    const second = await getDraftById(queuedSecondId);
    expect(first?.syncStatus).toBe('pending');
    expect(first?.retryCount).toBe(1);
    expect(second?.syncStatus).toBe('pending');
    expect(second?.retryCount).toBe(0);

    for (const [attempt, delay] of [
      [2, 1_000],
      [3, 2_000],
      [4, 4_000],
      [5, 8_000],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(attempt));
      await vi.waitFor(() => expect(getSyncState().isSyncing).toBe(false));
    }

    await vi.waitFor(async () => {
      first = await getDraftById(draftId);
      expect(first?.syncStatus).toBe('failed');
    });
    expect(first?.retryCount).toBe(MAX_SYNC_RETRIES);
    expect(getSyncState().phase).toBe('error');

    let recoveredCalls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      recoveredCalls += 1;
      const url = String(input);
      if (recoveredCalls === 1) {
        return mockJsonResponse(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '3' });
      }
      if (url === '/api/v1/recordings') {
        return mockJsonResponse(201, { duplicate: false, recording: { id: `srv-rec-${recoveredCalls}` } });
      }
      return mockJsonResponse(201, { duplicate: false, draft: { id: `srv-draft-${recoveredCalls}` } });
    });

    await retryFailedDraft(draftId);
    const reset = await getDraftById(draftId);
    expect(reset?.syncStatus).toBe('pending');
    expect(reset?.retryCount).toBe(0);

    await syncPendingDrafts({ manual: true });
    expect(recoveredCalls).toBe(1);
    expect(getSyncState().phase).toBe('backoff');

    await vi.advanceTimersByTimeAsync(2_900);
    expect(recoveredCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(recoveredCalls).toBe(5)); // 1(429) + 2(rec+draft for draftId) + 2(rec+draft for queuedSecondId)
    await vi.waitFor(() => expect(getSyncState().isSyncing).toBe(false));

    expect((await getDraftById(draftId))?.syncStatus).toBe('completed');
    expect((await getDraftById(queuedSecondId))?.syncStatus).toBe('completed');
  });

  it('aborts hung fetch on AbortError timeout (< 60s lease) and schedules backoff', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    signInTechnician();

    const draftId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId }));

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const syncPromise = syncPendingDrafts();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await syncPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const persisted = await getDraftById(draftId);
    expect(persisted?.syncStatus).toBe('pending');
    expect(persisted?.retryCount).toBe(1);
    expect(persisted?.lastError).toContain('timed out');
    expect(getSyncState().phase).toBe('backoff');
  });

  it('cleans up window/document listeners and backoff timers on stopSyncManager', async () => {
    const windowListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const docListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

    const origWindow = globalThis.window;
    const origDocument = globalThis.document;

    globalThis.window = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        windowListeners.get(type)?.delete(fn);
      },
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      visibilityState: 'visible',
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        if (!docListeners.has(type)) docListeners.set(type, new Set());
        docListeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        docListeners.get(type)?.delete(fn);
      },
    } as unknown as Document;

    try {
      const stop = startSyncManager();
      expect(windowListeners.get('online')?.size).toBe(1);
      expect(windowListeners.get('offline')?.size).toBe(1);
      expect(docListeners.get('visibilitychange')?.size).toBe(1);

      stop();
      expect(windowListeners.get('online')?.size).toBe(0);
      expect(windowListeners.get('offline')?.size).toBe(0);
      expect(docListeners.get('visibilitychange')?.size).toBe(0);
    } finally {
      globalThis.window = origWindow;
      globalThis.document = origDocument;
    }
  });
});
