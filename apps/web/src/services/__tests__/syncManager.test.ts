import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../api/session';
import {
  claimNextPendingDraft,
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

describe('US-04 Background Sync & US-03 Handshake', () => {
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

  it('syncs voice drafts in FIFO order with exact headers and preserves local draft data + attachments', async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedCalls.push({ url: String(input), init: init ?? {} });
      const idx = capturedCalls.length;
      return mockJsonResponse(idx === 1 ? 201 : 200, {
        duplicate: idx !== 1,
        recording: { id: `srv-rec-${idx}` },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedCalls[0].url).toBe('/api/v1/recordings');
    expect(capturedCalls[0].init.method).toBe('POST');
    expect(capturedCalls[0].init.body).toBeInstanceOf(Blob);
    expect(capturedCalls[0].init.body).not.toBeInstanceOf(FormData);
    expect(capturedCalls[0].init.headers).toEqual({
      Authorization: 'Bearer jwt-token-in-memory',
      'Idempotency-Key': olderId,
      'Content-Type': 'audio/webm;codecs=opus',
      'X-Duration-Ms': '14250',
      'X-Recorded-At': '2026-11-27T08:00:00.000Z',
    });

    expect((capturedCalls[1].init.headers as Record<string, string>)['Idempotency-Key']).toBe(newerId);

    const firstSaved = await getDraftById(olderId);
    const secondSaved = await getDraftById(newerId);
    expect(firstSaved?.syncStatus).toBe('completed');
    expect(firstSaved?.serverRecordingId).toBe('srv-rec-1');
    expect(firstSaved?.observation).toBe('Bearing vibration detected');
    expect(firstSaved?.attachments).toHaveLength(1);
    expect(secondSaved?.syncStatus).toBe('completed');
    expect(secondSaved?.serverRecordingId).toBe('srv-rec-2');
    expect(getSyncState().phase).toBe('idle');
  });

  it('checks navigator.onLine and access token before claiming so retryCount is never incremented', async () => {
    const draftId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId }));

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Logged out
    await syncPendingDrafts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().phase).toBe('paused_auth');
    let persisted = await getDraftById(draftId);
    expect(persisted?.syncStatus).toBe('pending');
    expect(persisted?.retryCount).toBe(0);

    // Offline while signed in
    signInTechnician();
    setOnlineState(false);
    await syncPendingDrafts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSyncState().phase).toBe('paused_offline');
    persisted = await getDraftById(draftId);
    expect(persisted?.syncStatus).toBe('pending');
    expect(persisted?.retryCount).toBe(0);
  });

  it('skips text-only drafts (no audio) cleanly without marking them failed or blocking voice drafts behind them', async () => {
    signInTechnician();
    const textDraftId = crypto.randomUUID();
    const voiceDraftId = crypto.randomUUID();

    await saveDraft({
      id: textDraftId,
      date: '2026-11-27T07:00:00.000Z',
      recordedAt: '2026-11-27T07:00:00.000Z',
      createdAt: 1_700_000_050_000,
      observation: 'Text-only inspection note',
      equipment: 'Valve V-10',
      subsystem: 'Actuator',
      symptom: 'Sticking stem',
      cause: '',
      action: '',
      parts: '',
      safety: '',
      mode: 'Text',
      duration: 0,
      durationMs: 0,
      userId: 'tech-user-1',
      attachments: [],
      syncStatus: 'pending',
    });

    await saveDraft(
      makeVoiceDraft({
        id: voiceDraftId,
        createdAt: 1_700_000_100_000,
      }),
    );

    const fetchMock = vi.fn(async () =>
      mockJsonResponse(201, { duplicate: false, recording: { id: 'srv-voice-1' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const textDraft = await getDraftById(textDraftId);
    const voiceDraft = await getDraftById(voiceDraftId);
    expect(textDraft?.syncStatus).toBe('pending');
    expect(textDraft?.retryCount).toBe(0);
    expect(textDraft?.lastError).toBeUndefined();
    expect(voiceDraft?.syncStatus).toBe('completed');
    expect(voiceDraft?.serverRecordingId).toBe('srv-voice-1');

    // Direct claimNextPendingDraft with requireAudio: true also returns null when only text drafts remain
    expect(await claimNextPendingDraft({ userId: 'tech-user-1', requireAudio: true })).toBeNull();
  });

  it('coalesces concurrent triggers via single-flight mutex and rerunRequested', async () => {
    signInTechnician();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: firstId, createdAt: 1_700_000_100_000 }));

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
        return mockJsonResponse(201, { duplicate: false, recording: { id: `srv-${callCount}` } });
      } finally {
        activeFetches -= 1;
      }
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const p1 = syncPendingDrafts();
    // Wait until first fetch is in flight
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await saveDraft(makeVoiceDraft({ id: secondId, createdAt: 1_700_000_200_000 }));
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
    await saveDraft(makeVoiceDraft({ id: validId, createdAt: 1_700_000_300_000 }));

    let idx = 0;
    const fetchMock = vi.fn(async () => {
      idx += 1;
      if (idx === 1) return mockJsonResponse(415, { error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
      if (idx === 2) return mockJsonResponse(413, { error: { code: 'PAYLOAD_TOO_LARGE' } });
      return mockJsonResponse(201, { duplicate: false, recording: { id: 'srv-ok' } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncPendingDrafts();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const badMime = await getDraftById(badMimeId);
    const tooLarge = await getDraftById(tooLargeId);
    const valid = await getDraftById(validId);

    expect(badMime?.syncStatus).toBe('failed');
    expect(badMime?.lastError).toContain('415');
    expect(tooLarge?.syncStatus).toBe('failed');
    expect(tooLarge?.lastError).toContain('413');
    expect(valid?.syncStatus).toBe('completed');
    expect(valid?.serverRecordingId).toBe('srv-ok');
  });

  it('handles 503 backoff, Retry-After on 429, retry cap (>= 5 -> failed), and manual retryFailedDraft', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    signInTechnician();

    const draftId = crypto.randomUUID();
    const queuedSecondId = crypto.randomUUID();
    await saveDraft(makeVoiceDraft({ id: draftId, createdAt: 1_700_000_100_000 }));
    await saveDraft(makeVoiceDraft({ id: queuedSecondId, createdAt: 1_700_000_200_000 }));

    const fetchMock = vi.fn(async () =>
      mockJsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // Attempt 1: 503 breaks loop (second draft untouched) and schedules 1000ms backoff
    await syncPendingDrafts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSyncState().phase).toBe('backoff');
    let first = await getDraftById(draftId);
    let second = await getDraftById(queuedSecondId);
    expect(first?.syncStatus).toBe('pending');
    expect(first?.retryCount).toBe(1);
    expect(second?.syncStatus).toBe('pending');
    expect(second?.retryCount).toBe(0);

    // Advance through attempts 2..5 (1s, 2s, 4s, 8s)
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

    // Manual retry resets retryCount and succeeds when backend recovers (and respects 429 Retry-After)
    let recoveredCall = 0;
    fetchMock.mockImplementation(async () => {
      recoveredCall += 1;
      if (recoveredCall === 1) {
        return mockJsonResponse(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '3' });
      }
      return mockJsonResponse(201, { duplicate: false, recording: { id: `srv-recovered-${recoveredCall}` } });
    });

    await retryFailedDraft(draftId);
    const reset = await getDraftById(draftId);
    expect(reset?.syncStatus).toBe('pending');
    expect(reset?.retryCount).toBe(0);

    await syncPendingDrafts({ manual: true });
    expect(recoveredCall).toBe(1);
    expect(getSyncState().phase).toBe('backoff');

    // Should NOT fire before Retry-After (3000ms)
    await vi.advanceTimersByTimeAsync(2_900);
    expect(recoveredCall).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(recoveredCall).toBe(3)); // uploads draftId then queuedSecondId
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
