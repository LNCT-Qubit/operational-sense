import type { TranscriptionResultDto } from '../recordings/recording.types';

export interface TranscriptionRequest {
  audioPath: string;
  recordingId: string;
  transcriptionId: string;
  attemptNumber: number;
}

export interface TranscriptionClient {
  transcribe(req: TranscriptionRequest): Promise<TranscriptionResultDto>;
}

/** The transcription service could not be reached / returned garbage. Distinct from "transcribed but failed". */
export class TranscriptionUnavailableError extends Error {}

/**
 * Calls the US-05 HTTP wrapper (services/ai-engine/app/transcription/server.py).
 * Contract from US-05's interface.py: file path + recording_id in, TranscriptionResult out. A FAILED/EMPTY
 * result is a normal 200 response (domain outcome); only transport/shape problems throw.
 */
export class HttpTranscriptionClient implements TranscriptionClient {
  constructor(private readonly opts: { baseUrl: string; timeoutMs: number; internalToken: string | null }) {}

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResultDto> {
    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.opts.internalToken ? { 'X-Internal-Token': this.opts.internalToken } : {}),
        },
        body: JSON.stringify({
          audio_path: req.audioPath,
          recording_id: req.recordingId,
          transcription_id: req.transcriptionId,
          attempt_number: req.attemptNumber,
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      throw new TranscriptionUnavailableError(name === 'TimeoutError' || name === 'AbortError' ? 'transcription service timed out' : 'transcription service unreachable');
    }
    if (!res.ok) throw new TranscriptionUnavailableError(`transcription service returned HTTP ${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new TranscriptionUnavailableError('transcription service returned invalid JSON');
    }
    return parseTranscriptionResult(body);
  }
}

/** Defensive parse of the US-05 payload; anything that breaks the contract is treated as "unavailable". */
export function parseTranscriptionResult(raw: unknown): TranscriptionResultDto {
  const o = raw as Record<string, any> | null;
  const bad = (why: string) => new TranscriptionUnavailableError(`transcription service violated its contract: ${why}`);
  if (!o || typeof o !== 'object') throw bad('not an object');
  if (!['COMPLETED', 'EMPTY', 'FAILED'].includes(o.status)) throw bad(`unexpected status`);
  if (typeof o.transcription_id !== 'string') throw bad('missing transcription_id');
  if (o.status === 'COMPLETED' && (typeof o.transcript !== 'string' || !o.transcript.trim())) throw bad('COMPLETED without transcript text');
  if (o.status === 'FAILED' && typeof o.error_code !== 'string') throw bad('FAILED without error_code');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    transcription_id: o.transcription_id,
    recording_id: typeof o.recording_id === 'string' ? o.recording_id : null,
    attempt_number: Number.isInteger(o.attempt_number) ? o.attempt_number : 1,
    status: o.status,
    transcript: o.status === 'COMPLETED' ? String(o.transcript).trim() : null,
    detected_language: typeof o.detected_language === 'string' ? o.detected_language : null,
    language_probability: num(o.language_probability),
    segments: Array.isArray(o.segments)
      ? o.segments.filter((s: any) => s && typeof s.text === 'string').map((s: any) => ({ start: num(s.start) ?? 0, end: num(s.end) ?? 0, text: s.text }))
      : [],
    processing_duration_seconds: num(o.processing_duration_seconds),
    error_code: o.status === 'FAILED' ? o.error_code : null,
    error_message: o.status === 'FAILED' && typeof o.error_message === 'string' ? o.error_message : null,
    model_name: typeof o.model_name === 'string' && o.model_name ? o.model_name : 'unknown',
    created_at: typeof o.created_at === 'string' ? o.created_at : new Date().toISOString(),
  };
}
