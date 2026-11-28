import { describe, expect, it } from 'vitest';
import { buildPipelineSnapshot, isInFlightStatus, isRetryableFailure } from '../pipelineStatus';

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'r1', processing_status: 'EXTRACTED', mime_type: 'audio/webm', size_bytes: 10, duration_ms: 1000,
  failure_code: null, failure_message: null, audio_url: '/x', ...over,
});

describe('buildPipelineSnapshot', () => {
  it('returns null for text-only drafts (no recording)', () => {
    expect(buildPipelineSnapshot({ recording: null, transcription: null, extraction_draft: null })).toBeNull();
  });

  it('maps in-flight statuses to the working stage', () => {
    for (const status of ['RECEIVED', 'TRANSCRIBING', 'TRANSCRIBED', 'EXTRACTING']) {
      const snap = buildPipelineSnapshot({ recording: rec({ processing_status: status }), transcription: null, extraction_draft: null });
      expect(snap?.stage).toBe('working');
      expect(isInFlightStatus(status)).toBe(true);
    }
  });

  it('exposes transcript and extracted fields, flags uncertain and missing ones', () => {
    const snap = buildPipelineSnapshot({
      recording: rec(),
      transcription: { id: 't1', status: 'COMPLETED', transcript: 'press stops, maybe sensor', detected_language: 'en', error_code: null },
      extraction_draft: {
        id: 'e1', status: 'DRAFT', missing_fields: ['operating_condition'],
        extraction: { equipment: 'press', symptom: 'stops randomly', operating_condition: null, observation: ' ', uncertain_fields: ['equipment'] },
      },
    });
    expect(snap?.stage).toBe('done');
    expect(snap?.transcript).toBe('press stops, maybe sensor');
    expect(snap?.extraction?.fields.find((f) => f.key === 'equipment')).toMatchObject({ value: 'press', uncertain: true });
    expect(snap?.extraction?.fields.find((f) => f.key === 'observation')?.value).toBeNull();
    expect(snap?.extraction?.missing).toEqual(['operating_condition']);
  });

  it('reports a transient failure as retryable and a bad-input failure as not retryable', () => {
    const transient = buildPipelineSnapshot({
      recording: rec({ processing_status: 'TRANSCRIPTION_FAILED', failure_code: 'TRANSCRIPTION_SERVICE_UNAVAILABLE', failure_message: 'Please retry later.' }),
      transcription: null, extraction_draft: null,
    });
    expect(transient?.stage).toBe('failed');
    expect(transient?.failure).toEqual({ code: 'TRANSCRIPTION_SERVICE_UNAVAILABLE', message: 'Please retry later.', retryable: true });
    const permanent = buildPipelineSnapshot({
      recording: rec({ processing_status: 'TRANSCRIPTION_FAILED', failure_code: 'NO_SPEECH_DETECTED', failure_message: 'No speech.' }),
      transcription: null, extraction_draft: null,
    });
    expect(permanent?.failure?.retryable).toBe(false);
    expect(isRetryableFailure('EXTRACTION_SERVICE_ERROR')).toBe(true);
    expect(isRetryableFailure('FILE_EMPTY')).toBe(false);
  });

  it('does not show a stale failure on a recovered recording', () => {
    const snap = buildPipelineSnapshot({ recording: rec({ failure_code: 'EXTRACTION_SERVICE_ERROR' }), transcription: null, extraction_draft: null });
    expect(snap?.failure).toBeNull();
  });
});

import { buildCaptureSteps, isCaptureSettled, buildPipelineSnapshotFromRecording } from '../pipelineStatus';
import type { ServerRecordingState } from '../../api/drafts';

const serverState = (status: string, over: Partial<ServerRecordingState> = {}): ServerRecordingState => ({
  recording: {
    id: 'r1', client_recording_id: 'c1', status, mime_type: 'audio/webm', size_bytes: 10, duration_ms: 1000, recorded_at: null,
    transcription_attempts: 1, failure: null, created_at: '', updated_at: '',
  },
  transcription: null,
  draft: null,
  ...over,
});

describe('buildCaptureSteps (real status only, no timers)', () => {
  it('shows only the local step for text-only observations', () => {
    const steps = buildCaptureSteps({ hasAudio: false, online: true, local: { syncStatus: 'pending' }, server: null });
    expect(steps.map((s) => s.key)).toEqual(['local']);
  });

  it('keeps upload waiting (not done) while offline and nothing is uploaded', () => {
    const steps = buildCaptureSteps({ hasAudio: true, online: false, local: { syncStatus: 'pending' }, server: null });
    expect(steps.find((s) => s.key === 'upload')?.state).toBe('waiting');
    expect(steps.find((s) => s.key === 'transcription')?.state).toBe('waiting');
    expect(steps.find((s) => s.key === 'extraction')?.state).toBe('waiting');
  });

  it('marks transcription/extraction from the backend status only', () => {
    const working = buildCaptureSteps({ hasAudio: true, online: true, local: { syncStatus: 'completed', serverRecordingId: 'r1' }, server: serverState('TRANSCRIBING') });
    expect(working.find((s) => s.key === 'transcription')?.state).toBe('working');
    expect(working.find((s) => s.key === 'extraction')?.state).toBe('waiting');
    const done = buildCaptureSteps({ hasAudio: true, online: true, local: { syncStatus: 'completed', serverRecordingId: 'r1' }, server: serverState('EXTRACTED') });
    expect(done.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('distinguishes an upload failure from a processing failure', () => {
    const upload = buildCaptureSteps({ hasAudio: true, online: true, local: { syncStatus: 'failed', lastError: 'HTTP 500' }, server: null });
    expect(upload.find((s) => s.key === 'upload')?.state).toBe('failed');
    const proc = buildCaptureSteps({
      hasAudio: true, online: true, local: { syncStatus: 'completed', serverRecordingId: 'r1' },
      server: serverState('EXTRACTION_FAILED', { recording: { ...serverState('EXTRACTION_FAILED').recording, failure: { code: 'EXTRACTION_SERVICE_ERROR', message: 'Try later', retryable: true } } }),
    });
    expect(proc.find((s) => s.key === 'upload')?.state).toBe('done');
    expect(proc.find((s) => s.key === 'transcription')?.state).toBe('done');
    expect(proc.find((s) => s.key === 'extraction')?.state).toBe('failed');
  });
});

describe('isCaptureSettled / buildPipelineSnapshotFromRecording', () => {
  it('settles only on a terminal backend status, a device upload failure, or no audio', () => {
    expect(isCaptureSettled({ hasAudio: true, online: true, local: { syncStatus: 'completed', serverRecordingId: 'r1' }, server: serverState('EXTRACTING') })).toBe(false);
    expect(isCaptureSettled({ hasAudio: true, online: true, local: { syncStatus: 'completed', serverRecordingId: 'r1' }, server: serverState('EXTRACTED') })).toBe(true);
    expect(isCaptureSettled({ hasAudio: true, online: true, local: { syncStatus: 'failed' }, server: null })).toBe(true);
    expect(isCaptureSettled({ hasAudio: false, online: true, local: { syncStatus: 'pending' }, server: null })).toBe(true);
  });

  it('exposes the persisted transcript and extracted fields, keeping null and uncertain fields', () => {
    const snap = buildPipelineSnapshotFromRecording(serverState('EXTRACTED', {
      transcription: { id: 't1', attempt_number: 1, status: 'COMPLETED', transcript: 'press stops', language: 'en', language_probability: 0.9, processing_duration_seconds: 1, model_name: 'whisper', error_code: null, created_at: '' },
      draft: { id: 'e1', status: 'DRAFT', missing_fields: ['observation'], transcription_id: 't1', created_at: '', extraction: { equipment: 'press', symptom: 'stops', operating_condition: null, observation: null, uncertain_fields: ['equipment'] } },
    }));
    expect(snap?.transcript).toBe('press stops');
    expect(snap?.extraction?.fields.find((f) => f.key === 'equipment')).toMatchObject({ value: 'press', uncertain: true });
    expect(snap?.extraction?.fields.find((f) => f.key === 'observation')?.value).toBeNull();
  });
});
