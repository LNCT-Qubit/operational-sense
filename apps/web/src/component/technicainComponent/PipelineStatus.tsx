import type { PipelineSnapshot } from '../../features/pipelineStatus';

/**
 * Sprint 2 Block 3: real pipeline status for a synced voice recording (upload -> transcription -> extraction).
 * Presentational only: the parent owns data refresh and the retry call. Inline styles match DraftsPage's existing look.
 */
export function PipelineStatus({
  snapshot,
  retrying,
  retryError,
  onRetry,
}: {
  snapshot: PipelineSnapshot;
  retrying: boolean;
  retryError?: string;
  onRetry?: () => void;
}) {
  const colour = snapshot.stage === 'failed' ? '#b84a3a' : snapshot.stage === 'done' ? '#1f7a4d' : '#08677a';
  return (
    <div role="status" aria-live="polite" style={{ marginTop: '6px', fontSize: '0.85rem' }}>
      <small style={{ display: 'block', color: colour, fontWeight: 600 }}>
        {snapshot.stage === 'working' ? '⏳ ' : snapshot.stage === 'done' ? '✓ ' : '⚠ '}
        {snapshot.label}
      </small>

      {snapshot.failure && (
        <small style={{ display: 'block', color: '#b84a3a', marginTop: '2px' }}>
          {snapshot.failure.message}
          {!snapshot.failure.retryable ? ' Record a new voice note to try again.' : ''}
        </small>
      )}

      {snapshot.failure?.retryable && onRetry && (
        <button
          type="button"
          className="button-light"
          onClick={onRetry}
          disabled={retrying}
          style={{ minHeight: '34px', padding: '6px 10px', marginTop: '6px' }}
        >
          {retrying ? 'Retrying…' : 'Retry processing'}
        </button>
      )}
      {retryError && (
        <small role="alert" style={{ display: 'block', color: '#b84a3a', marginTop: '2px' }}>
          {retryError}
        </small>
      )}

      {snapshot.transcript && (
        <small style={{ display: 'block', color: '#08677a', marginTop: '4px' }}>
          Transcript{snapshot.language ? ` (${snapshot.language})` : ''}: {snapshot.transcript}
        </small>
      )}

      {snapshot.extraction && (
        <dl style={{ margin: '6px 0 0', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 10px' }}>
          {snapshot.extraction.fields.map((f) => (
            <div key={f.key} style={{ display: 'contents' }}>
              <dt style={{ color: '#526b75' }}>{f.label}</dt>
              <dd style={{ margin: 0 }}>
                {f.value ?? <em style={{ color: '#8a9aa1' }}>Not mentioned</em>}
                {f.uncertain ? <span style={{ color: '#b7791f', marginLeft: '6px' }}>(unclear, please check)</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
