import { Icon } from './Icons';
import { PipelineStatus } from './PipelineStatus';
import { useCaptureProgress } from '../../features/useCaptureProgress';
import type { CaptureStep } from '../../features/pipelineStatus';

function StepIcon({ step }: { step: CaptureStep }) {
  if (step.state === 'done') return <Icon name="check" />;
  if (step.state === 'working') {
    return (
      <span className="technician-processing-spinner">
        <Icon name="refresh" />
      </span>
    );
  }
  if (step.state === 'failed') return <span aria-hidden="true">⚠</span>;
  return <Icon name="circle" />;
}

/**
 * Shown after an observation is saved. Every row is driven by real data (device sync record + backend recording
 * status); see useCaptureProgress. Reuses PipelineStatus for transcript, extracted fields, failures and retry.
 */
export function CaptureProgress({ draftId, hasAudio }: { draftId: string; hasAudio: boolean }) {
  const progress = useCaptureProgress(draftId, hasAudio);
  const uploadFailed = progress.steps.some((s) => s.key === 'upload' && s.state === 'failed');

  return (
    <div className="technician-processing-list" aria-live="polite">
      {progress.steps.map((step) => (
        <div className="technician-processing-item" key={step.key} style={{ alignItems: 'flex-start' }}>
          <span
            className={`technician-processing-status ${
              step.state === 'done' ? 'completed' : step.state === 'working' ? 'active' : 'pending'
            }`}
            style={step.state === 'failed' ? { color: '#b84a3a' } : undefined}
          >
            <StepIcon step={step} />
          </span>
          <span style={{ fontWeight: step.state === 'waiting' ? 400 : 600, textAlign: 'left' }}>
            {step.label}
            {step.detail && (
              <small style={{ display: 'block', fontWeight: 400, color: step.state === 'failed' ? '#b84a3a' : '#526b75' }}>
                {step.detail}
              </small>
            )}
          </span>
        </div>
      ))}

      {uploadFailed && (
        <button type="button" className="button-light" onClick={() => void progress.retryUpload()} style={{ marginTop: '8px' }}>
          Retry upload
        </button>
      )}

      {progress.snapshot && (progress.snapshot.stage !== 'working' || progress.snapshot.transcript || progress.snapshot.extraction) && (
        <PipelineStatus
          snapshot={progress.snapshot}
          retrying={progress.retrying}
          retryError={progress.processError}
          onRetry={() => void progress.retryProcessing()}
        />
      )}

      {progress.serverReadError && (
        <small role="alert" style={{ display: 'block', color: '#b7791f', marginTop: '6px' }}>
          Could not refresh the server status just now. Showing the last known state.
        </small>
      )}
    </div>
  );
}
