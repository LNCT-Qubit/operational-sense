import type { CSSProperties } from 'react';
import { formatDuration, useAudioRecorder } from '../../features/useAudioRecorder';
import { Icon } from './Icons';

export function RecordingPanel() {
  const recorder = useAudioRecorder();
  const recording = recorder.status === 'recording';
  const paused = recorder.status === 'paused';
  const requesting = recorder.status === 'requesting';
  const busy = recording || paused || requesting;
  const preview = recorder.status === 'preview';
  const remaining = Math.max(0, 30_000 - recorder.durationMs);
  const extension = recorder.mimeType?.includes('mp4') ? 'm4a' : recorder.mimeType?.includes('ogg') ? 'ogg' : 'webm';
  const status = requesting ? 'Requesting microphone access' : recording ? 'Recording in progress' : paused ? 'Recording paused' : preview ? 'Preview ready' : recorder.status === 'error' ? 'Recording needs attention' : 'Ready to record';

  return <section className={`recording-panel ${recording ? 'is-recording' : ''} ${paused ? 'is-paused' : ''}`} aria-labelledby="recorder-title">
    <div className="panel-heading"><h2 id="recorder-title">Field observation recorder</h2><p>Quickly capture a voice observation from the field.</p></div>
    <div className="recorder-center">
      <div className="timer-circle"><span className="timer-value">{formatDuration(recorder.durationMs)}</span><span className="timer-limit">Maximum 30 seconds</span><span className="timer-progress" style={{'--progress': `${Math.min(100, recorder.durationMs / 30000 * 100)}%`} as CSSProperties}/></div>
      <p className="recorder-status" role="status" aria-live="polite">{status}</p>
      {recording && <p className="remaining-time">{formatDuration(remaining)} remaining</p>}
      <div className="recording-controls">
        {!busy && !preview && <button className="button-primary" type="button" onClick={() => void recorder.startRecording()}><Icon name="mic"/>{recorder.status === 'error' ? 'Try again' : 'Start recording'}</button>}
        {requesting && <button className="button-primary" type="button" disabled>Requesting access…</button>}
        {recording && <><button className="button-secondary" type="button" onClick={recorder.pauseRecording}><Icon name="pause"/>Pause</button><button className="button-danger" type="button" onClick={recorder.stopRecording}><Icon name="stop"/>Finish</button></>}
        {paused && <><button className="button-primary" type="button" onClick={recorder.resumeRecording}><Icon name="play"/>Resume</button><button className="button-danger" type="button" onClick={recorder.stopRecording}><Icon name="stop"/>Finish</button></>}
        {preview && <button className="button-secondary" type="button" onClick={recorder.discardRecording}><Icon name="trash"/>Discard recording</button>}
      </div>
      {recorder.errorMessage && <p className="error-message" role="alert">{recorder.errorMessage}</p>}
      {preview && recorder.audioUrl && <div className="audio-preview"><label htmlFor="audio-preview">Listen to your recording</label><audio id="audio-preview" controls src={recorder.audioUrl}/><a href={recorder.audioUrl} download={`operational-sense-note.${extension}`}><Icon name="download"/> Download audio</a></div>}
    </div>
    <div className="recording-hint"><Icon name="info"/><p><strong>Tip:</strong> Mention the equipment, what you noticed, and when it happens. You do not need to diagnose the cause.</p></div>
  </section>;
}
