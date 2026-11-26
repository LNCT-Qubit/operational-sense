/**
 * Upload-time audio checks: normalise the Content-Type, map it to a file extension WE choose (never the
 * client's filename, so there is no path-traversal surface), and sniff the first bytes so a file cannot claim
 * to be audio/wav while being something else. US-05 re-validates; this just rejects early and cheaply.
 */
interface Format { ext: string; sniff: (b: Buffer) => boolean }

const ascii = (b: Buffer, start: number, text: string) => b.length >= start + text.length && b.toString('latin1', start, start + text.length) === text;

const WAV: Format = { ext: 'wav', sniff: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE') };
const FLAC: Format = { ext: 'flac', sniff: (b) => ascii(b, 0, 'fLaC') };
const OGG: Format = { ext: 'ogg', sniff: (b) => ascii(b, 0, 'OggS') };
const MP3: Format = { ext: 'mp3', sniff: (b) => ascii(b, 0, 'ID3') || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) };
const WEBM: Format = { ext: 'webm', sniff: (b) => b.length > 3 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 };
const M4A: Format = { ext: 'm4a', sniff: (b) => ascii(b, 4, 'ftyp') };

export const KNOWN_FORMATS: Readonly<Record<string, Format>> = {
  'audio/wav': WAV, 'audio/x-wav': WAV, 'audio/wave': WAV,
  'audio/mpeg': MP3, 'audio/mp3': MP3,
  'audio/flac': FLAC, 'audio/x-flac': FLAC,
  'audio/ogg': OGG,
  'audio/webm': WEBM,
  'audio/mp4': M4A, 'audio/x-m4a': M4A,
};

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function normalizeMime(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const base = contentType.split(';')[0].trim().toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/.test(base) ? base : null;
}

export type AudioCheck =
  | { ok: true; mime: string; ext: string }
  | { ok: false; reason: 'NOT_AUDIO' | 'NOT_ALLOWED' | 'CONTENT_MISMATCH'; mime: string | null };

export function checkAudio(contentType: string | undefined, body: Buffer, allowed: ReadonlySet<string>): AudioCheck {
  const mime = normalizeMime(contentType);
  if (!mime) return { ok: false, reason: 'NOT_AUDIO', mime: null };
  const fmt = KNOWN_FORMATS[mime];
  if (!allowed.has(mime) || !fmt) return { ok: false, reason: 'NOT_ALLOWED', mime };
  if (!fmt.sniff(body)) return { ok: false, reason: 'CONTENT_MISMATCH', mime };
  return { ok: true, mime, ext: fmt.ext };
}
