import { pipeStreamToResponse } from '../../http/stream';
import { asyncHandler, type Handler, type HttpRequest } from '../../http/types';
import { ApiError, badRequest, payloadTooLarge, unsupportedMediaType } from '../../http/errors';
import { isUuid } from '../../middleware/auth';
import { checkAudio } from './audio-format';
import { isRetryable, type CaptureService, type CaptureState } from './recording.service';
import { RECORDING_STATUSES, type DraftSummary, type RecordingRow, type RecordingStatus } from './recording.types';

export const API_PREFIX = '/api/v1';

const headerOf = (req: HttpRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

function idParam(req: HttpRequest): string {
  const id = req.params.id;
  if (!isUuid(id)) throw badRequest('INVALID_ID', 'The recording id in the URL is not a valid UUID.');
  return id.toLowerCase();
}

/** Public JSON shape of a recording. Deliberately omits storage_uri / sha256 / uploader internals. */
export function recordingView(r: RecordingRow) {
  return {
    id: r.recording_id,
    client_recording_id: r.client_recording_id,
    status: r.processing_status,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    duration_ms: r.duration_ms,
    recorded_at: r.recorded_at,
    transcription_attempts: r.transcription_attempts,
    failure: r.failure_code ? { code: r.failure_code, message: r.failure_message, retryable: isRetryable(r.failure_code) } : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    links: { self: `${API_PREFIX}/recordings/${r.recording_id}`, draft: `${API_PREFIX}/recordings/${r.recording_id}/draft` },
  };
}

const draftView = (d: DraftSummary | null) => d && { id: d.id, status: d.status, missing_fields: d.missing_fields, transcription_id: d.transcription_id, created_at: d.created_at };

export function stateView(s: CaptureState) {
  const t = s.transcription;
  return {
    recording: recordingView(s.recording),
    transcription: t && {
      id: t.transcription_id, attempt_number: t.attempt_number, status: t.status, transcript: t.transcript,
      language: t.detected_language, language_probability: t.language_probability,
      processing_duration_seconds: t.processing_duration_seconds, model_name: t.model_name,
      error_code: t.error_code, created_at: t.created_at,
    },
    draft: draftView(s.draft),
  };
}

function optionalInt(req: HttpRequest, header: string, max: number): number | null {
  const raw = headerOf(req, header);
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n > max) throw badRequest('INVALID_HEADER', `${header} must be an integer between 0 and ${max}.`);
  return n;
}

function optionalDate(req: HttpRequest, header: string): string | null {
  const raw = headerOf(req, header);
  if (raw === undefined || raw === '') return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t) || !/^\d{4}-\d{2}-\d{2}/.test(raw)) throw badRequest('INVALID_HEADER', `${header} must be an ISO-8601 date-time.`);
  return new Date(t).toISOString();
}

export interface HandlerConfig { allowedMimeTypes: ReadonlySet<string>; maxUploadBytes: number }

export function createRecordingHandlers(service: CaptureService, cfg: HandlerConfig) {
  /** POST /api/v1/recordings  (raw audio bytes in the body) */
  const upload: Handler = asyncHandler(async (req, res) => {
    const auth = req.auth!;                                                  // set by authenticate(); never from the body
    const key = headerOf(req, 'idempotency-key');
    if (!key || !isUuid(key)) {
      throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Send the client-generated recording id as an "Idempotency-Key" header (UUID).', [{ field: 'Idempotency-Key', issue: 'required UUID' }]);
    }
    const durationMs = optionalInt(req, 'x-duration-ms', 60 * 60 * 1000);
    const recordedAt = optionalDate(req, 'x-recorded-at');

    // express.raw() only fills req.body with a Buffer when Content-Type is audio/*; otherwise body is {}.
    if (!Buffer.isBuffer(req.body)) throw unsupportedMediaType('Send the audio bytes as the request body with an audio/* Content-Type.');
    if (req.body.length === 0) throw badRequest('EMPTY_BODY', 'The uploaded audio is empty.');
    if (req.body.length > cfg.maxUploadBytes) throw payloadTooLarge(`Audio must be at most ${cfg.maxUploadBytes} bytes.`);

    const check = checkAudio(headerOf(req, 'content-type'), req.body, cfg.allowedMimeTypes);
    if (!check.ok) {
      if (check.reason === 'CONTENT_MISMATCH') throw unsupportedMediaType('The file contents do not match the declared audio type.');
      if (check.reason === 'NOT_ALLOWED') throw unsupportedMediaType(`Audio type "${check.mime}" is not accepted. Accepted: ${[...cfg.allowedMimeTypes].join(', ')}.`);
      throw unsupportedMediaType('Content-Type must be an audio/* type.');
    }

    const { recording, created } = await service.upload(auth, {
      clientRecordingId: key.toLowerCase(), body: req.body, ext: check.ext, mime: check.mime, durationMs, recordedAt,
    });
    res.setHeader('Location', `${API_PREFIX}/recordings/${recording.recording_id}`);
    res.status(created ? 201 : 200).json({ duplicate: !created, recording: recordingView(recording) });
  });

  /** GET /api/v1/recordings/:id */
  const get: Handler = asyncHandler(async (req, res) => {
    res.status(200).json(stateView(await service.get(req.auth!, idParam(req))));
  });

  /** GET /api/v1/recordings */
  const list: Handler = asyncHandler(async (req, res) => {
    const status = req.query.status;
    if (status !== undefined && !(typeof status === 'string' && (RECORDING_STATUSES as readonly string[]).includes(status))) {
      throw badRequest('INVALID_QUERY', `status must be one of ${RECORDING_STATUSES.join(', ')}.`);
    }
    const num = (v: unknown, def: number, min: number, max: number, name: string) => {
      if (v === undefined) return def;
      const n = Number(v);
      if (typeof v !== 'string' || !/^\d+$/.test(v) || n < min || n > max) throw badRequest('INVALID_QUERY', `${name} must be an integer between ${min} and ${max}.`);
      return n;
    };
    const rows = await service.list(req.auth!, {
      status: status as RecordingStatus | undefined, limit: num(req.query.limit, 25, 1, 100, 'limit'), offset: num(req.query.offset, 0, 0, 1_000_000, 'offset'),
    });
    res.status(200).json({ items: rows.map(recordingView), count: rows.length });
  });

  /**
   * POST /api/v1/recordings/:id/process[?wait=true]
   * Starts (or resumes/retries) the pipeline. Default: 202 and run in the background. wait=true: run to completion
   * and return the final state with stage timings (used for retries from the UI and for US-08 latency measurement).
   */
  const processRecording: Handler = asyncHandler(async (req, res) => {
    const id = idParam(req);
    const wait = req.query.wait;
    if (wait !== undefined && wait !== 'true' && wait !== 'false') throw badRequest('INVALID_QUERY', 'wait must be "true" or "false".');
    const auth = req.auth!;
    if (wait === 'true') {
      const out = await service.process(auth, id);
      res.status(200).json({ ...stateView(out.state), timings_ms: out.timingsMs });
      return;
    }
    const state = await service.get(auth, id);                              // 404 / ownership check happens before we accept the work
    if (state.recording.processing_status !== 'EXTRACTED') service.schedule(auth, id);
    res.setHeader('Location', `${API_PREFIX}/recordings/${id}`);
    res.status(202).json(stateView(state));
  });

  /** GET /api/v1/recordings/:id/draft */
  const getDraft: Handler = asyncHandler(async (req, res) => {
    const d = await service.getDraft(req.auth!, idParam(req));
    res.status(200).json({ draft: draftView(d) });
  });

  /** GET /api/v1/recordings/:id/audio */
  const getAudio: Handler = asyncHandler(async (req, res) => {
    const audio = await service.getAudioStream(req.auth!, idParam(req));
    const total = audio.sizeBytes;
    const rangeHeader = headerOf(req, 'range');

    res.setHeader('Content-Type', audio.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let stream: NodeJS.ReadableStream;
    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!m || (!m[1] && !m[2])) {
        res.setHeader('Content-Range', `bytes */${total}`);
        throw new ApiError(416, 'RANGE_NOT_SATISFIABLE', 'Requested byte range is not satisfiable.');
      }
      const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        throw new ApiError(416, 'RANGE_NOT_SATISFIABLE', 'Requested byte range is not satisfiable.');
      }
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.status(206);
      stream = audio.openStream({ start, end });
    } else {
      res.setHeader('Content-Length', String(total));
      res.status(200);
      stream = audio.openStream();
    }

    await pipeStreamToResponse(res, stream);
  });

  return { upload, get, list, processRecording, getDraft, getAudio };
}
