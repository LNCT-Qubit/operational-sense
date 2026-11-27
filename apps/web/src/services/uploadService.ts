import { getAccessToken } from '../api/session';
import type { HydratedTechnicianDraft } from '../features/draftStore';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export interface UploadResult {
  ok: boolean;
  networkError?: boolean;
  authError?: boolean;
  httpStatus?: number;
  errorMessage?: string;
  serverRecordingId?: string;
}

export async function uploadRecording(
  draft: HydratedTechnicianDraft,
  signal?: AbortSignal,
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

  if (!audio) {
    return {
      ok: false,
      errorMessage: 'No audio attached to this recording.',
    };
  }

  const mimeType = draft.audioMimeType || draft.audioType || audio.type || 'audio/webm';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Idempotency-Key': draft.id,
    'Content-Type': mimeType,
  };

  if (draft.durationMs !== undefined) {
    headers['X-Duration-Ms'] = String(draft.durationMs);
  } else if (draft.duration !== undefined) {
    headers['X-Duration-Ms'] = String(draft.duration * 1000);
  }

  if (draft.recordedAt) {
    headers['X-Recorded-At'] = draft.recordedAt;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/recordings`, {
      method: 'POST',
      headers,
      body: audio,
      signal,
    });

    if (response.status === 401) {
      return {
        ok: false,
        authError: true,
        httpStatus: 401,
        errorMessage: 'Authentication expired. Sign in again.',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        errorMessage: `Upload failed with HTTP ${response.status}.`,
      };
    }

    const data = await response.json();

    return {
      ok: true,
      httpStatus: response.status,
      serverRecordingId: data.recording?.id,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    return {
      ok: false,
      networkError: true,
      errorMessage: 'Network unavailable. Upload will retry.',
    };
  }
}