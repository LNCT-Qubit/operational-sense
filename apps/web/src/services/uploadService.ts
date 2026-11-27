import { getAccessToken } from '../api/session';
import type { HydratedTechnicianDraft } from '../features/draftStore';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const MAX_DURATION_MS = 60 * 60 * 1000;

/** Strictly shorter than syncManager's 60s claim lease so requests abort before lease expiry. */
export const UPLOAD_TIMEOUT_MS = 45_000;

export interface UploadResult {
  ok: boolean;
  retryable?: boolean;
  networkError?: boolean;
  authError?: boolean;
  timeoutError?: boolean;
  httpStatus?: number;
  retryAfterMs?: number;
  errorMessage?: string;
  serverRecordingId?: string;
}

export function parseRetryAfterMs(headerValue: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    return undefined;
  }

  const targetMs = Date.parse(trimmed);
  if (!Number.isNaN(targetMs)) {
    return Math.max(0, targetMs - nowMs);
  }
  return undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function resolveDurationHeader(draft: HydratedTechnicianDraft): string | null {
  const raw =
    typeof draft.durationMs === 'number' && Number.isFinite(draft.durationMs)
      ? draft.durationMs
      : typeof draft.duration === 'number' && Number.isFinite(draft.duration)
        ? draft.duration
        : null;
  if (raw === null || raw < 0) return null;
  const rounded = Math.round(raw);
  if (!Number.isSafeInteger(rounded) || rounded > MAX_DURATION_MS) return null;
  return String(rounded);
}

export async function uploadRecording(
  draft: HydratedTechnicianDraft,
  signal?: AbortSignal,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<UploadResult> {
  const token = getAccessToken();

  if (!token) {
    return {
      ok: false,
      authError: true,
      errorMessage: 'Authentication required.',
    };
  }

  const audio = draft.audio;

  if (!audio || audio.size <= 0) {
    return {
      ok: false,
      retryable: false,
      errorMessage: 'No audio attached to this recording.',
    };
  }

  const mimeType = draft.audioMimeType || draft.audioType || audio.type || 'audio/webm';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': draft.id,
    'Content-Type': mimeType,
  };

  const durationHeader = resolveDurationHeader(draft);
  if (durationHeader !== null) {
    headers['X-Duration-Ms'] = durationHeader;
  }

  if (draft.recordedAt) {
    headers['X-Recorded-At'] = draft.recordedAt;
  }

  const controller = new AbortController();
  let timedOut = false;
  let onExternalAbort: (() => void) | undefined;

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      onExternalAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/recordings`, {
      method: 'POST',
      headers,
      body: audio,
      signal: controller.signal,
    });

    if (response.status === 401) {
      return {
        ok: false,
        authError: true,
        httpStatus: 401,
        errorMessage: 'Authentication expired. Sign in again.',
      };
    }

    if (response.status === 200 || response.status === 201 || response.status === 202) {
      let data: { recording?: { id?: unknown }; id?: unknown } | null = null;
      try {
        data = (await response.json()) as { recording?: { id?: unknown }; id?: unknown } | null;
      } catch {
        data = null;
      }
      const serverRecordingId =
        typeof data?.recording?.id === 'string' && data.recording.id
          ? data.recording.id
          : typeof data?.id === 'string' && data.id
            ? data.id
            : undefined;

      if (!serverRecordingId) {
        return {
          ok: false,
          retryable: false,
          httpStatus: response.status,
          errorMessage: 'Server upload response did not contain a recording ID.',
        };
      }

      return {
        ok: true,
        httpStatus: response.status,
        serverRecordingId,
      };
    }

    const retryable = isRetryableStatus(response.status);
    const retryAfterMs = retryable
      ? parseRetryAfterMs(response.headers?.get?.('Retry-After'))
      : undefined;

    return {
      ok: false,
      retryable,
      httpStatus: response.status,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      errorMessage: `Upload failed with HTTP ${response.status}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        retryable: true,
        networkError: true,
        timeoutError: timedOut,
        errorMessage: timedOut
          ? 'Upload timed out. Will retry.'
          : 'Upload was interrupted. Will retry.',
      };
    }

    return {
      ok: false,
      retryable: true,
      networkError: true,
      errorMessage: 'Network unavailable. Upload will retry.',
    };
  } finally {
    clearTimeout(timeoutId);
    if (signal && onExternalAbort) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
