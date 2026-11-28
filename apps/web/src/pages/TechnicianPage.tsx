
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { clearSession, getAccessToken, getCurrentUser } from '../api/session';
import {
  deleteServerDraft,
  fetchAttachmentBlobUrl,
  fetchRecordingAudioUrl,
  listServerDrafts,
  processServerRecordingRequest,
  searchServerCases,
  type ServerAttachmentMeta,
  type ServerCaseItem,
  type ServerDraftDetail,
} from '../api/drafts';
import { formatDuration, useAudioRecorder } from '../features/useAudioRecorder';
import {
  DraftStorageError,
  deleteDraft,
  getDrafts,
  getStorageQuotaStatus,
  retryFailedDraft,
  saveDraft,
  type DraftSyncStatus,
  type StorageQuotaStatus,
  type TechnicianDraft,
} from '../features/draftStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { syncPendingDrafts, type SyncStateSnapshot } from '../services/syncManager';
import { Brand } from '../component/technicainComponent/Brand';
import { Icon } from '../component/technicainComponent/Icons';
import { PipelineStatus } from '../component/technicainComponent/PipelineStatus';
import { CaptureProgress } from '../component/technicainComponent/CaptureProgress';
import { buildPipelineSnapshot, isInFlightStatus, type PipelineSnapshot } from '../features/pipelineStatus';

type Page = 'capture' | 'drafts' | 'search' | 'profile';
type Draft = TechnicianDraft;
type DisplayDraft = Draft & {
  isServerOnly?: boolean;
  serverStatus?: ServerDraftDetail['status'];
  recordingStatus?: string;
  pipeline?: PipelineSnapshot | null;
  transcriptionText?: string | null;
  reviewComment?: string | null;
  serverAttachments?: ServerAttachmentMeta[];
};
type CaptureStage = 'capture' | 'review' | 'processing' | 'success';

type DraftMediaUrls = {
  audioUrl?: string;
  attachmentUrls: string[];
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSyncStatusLabel(status: Draft['syncStatus']): DraftSyncStatus {
  return status === 'local' ? 'pending' : status;
}

function scopeDraftsToUser(allDrafts: Draft[], userId?: string): Draft[] {
  if (!userId) {
    return allDrafts.filter((draft) => !draft.userId);
  }
  return allDrafts.filter((draft) => !draft.userId || draft.userId === userId);
}

function extractStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DraftStorageError) return error.userMessage;
  return fallback;
}

function StorageAlertBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        marginBottom: '16px',
        padding: '12px 14px',
        border: '1px solid #e7c2bc',
        borderRadius: '10px',
        background: '#fbe9e6',
        color: '#a23d2f',
        fontSize: '12px',
        lineHeight: 1.45,
      }}
    >
      <Icon name="alert" style={{ width: '17px', height: '17px', flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1, fontWeight: 600 }}>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss storage alert"
          style={{
            background: 'transparent',
            color: '#a23d2f',
            padding: '2px 4px',
            lineHeight: 1,
            fontWeight: 700,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

const emptyDraft = (): Pick<Draft, 'observation' | 'equipment' | 'subsystem' | 'symptom' | 'cause' | 'action' | 'parts' | 'safety' | 'mode' | 'duration'> => ({
  observation: '',
  equipment: '',
  subsystem: '',
  symptom: '',
  cause: '',
  action: '',
  parts: '',
  safety: '',
  mode: 'Text',
  duration: 0,
});

function Status({ online }: { online: boolean }) {
  return (
    <span className={`network-status ${online ? 'online' : 'offline'}`} role="status">
      <Icon name="wifi" />
      <i />
      {online ? 'Network online' : 'Offline mode'}
    </span>
  );
}

function formatHeaderSyncLabel(online: boolean, syncState: SyncStateSnapshot, pendingCount: number): string {
  if (!online || syncState.phase === 'paused_offline') return 'Sync paused (offline)';
  if (syncState.phase === 'paused_auth') return 'Sign in to sync';
  if (syncState.isSyncing) return 'Syncing…';
  if (syncState.phase === 'backoff') {
    return pendingCount > 0 ? `Retry queued (${pendingCount})` : 'Retry scheduled';
  }
  if (pendingCount > 0) return `Pending (${pendingCount})`;
  if (syncState.lastSyncAt) return 'Synced';
  return 'Sync idle';
}

function Header({
  page,
  online,
  draftsCount,
  pendingCount,
  syncState,
  onSyncNow,
  navigate,
}: {
  page: Page;
  online: boolean;
  draftsCount: number;
  pendingCount: number;
  syncState: SyncStateSnapshot;
  onSyncNow: () => void;
  navigate: (page: Page) => void;
}) {
  const navigateToRoute = useNavigate();
  const currentUser = getCurrentUser();
  const logout = () => { clearSession(); navigateToRoute('/', { replace: true }); };
  const syncLabel = formatHeaderSyncLabel(online, syncState, pendingCount);
  const links: { id: Page; label: string; icon: 'mic' | 'file' | 'search' | 'user' }[] = [
    { id: 'capture', label: 'Capture', icon: 'mic' },
    { id: 'drafts', label: `Drafts${draftsCount > 0 ? ` (${draftsCount})` : ''}`, icon: 'file' },
    { id: 'search', label: 'Search cases', icon: 'search' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} title="Back to Landing Page">
          <Brand />
        </Link>
      </div>

      <nav className="desktop-nav" aria-label="Main navigation">
        {links.map((link) => (
          <button
            key={link.id}
            type="button"
            className={page === link.id ? 'top-link active' : 'top-link'}
            onClick={() => navigate(link.id)}
          >
            <Icon name={link.icon} />
            {link.label}
          </button>
        ))}
      </nav>

      <div className="topbar-status">
        <Status online={online} />
        {currentUser && <button type="button" className="top-link" onClick={logout}>Log out</button>}
        <button
          type="button"
          className="top-link sync-state"
          onClick={onSyncNow}
          disabled={!online || syncState.isSyncing}
          aria-label="Sync pending drafts"
          title={online ? 'Sync pending audio drafts now' : 'Offline — sync will resume when online'}
        >
          <Icon name="refresh" />
          <span>{syncLabel}</span>
        </button>
        {/* <Link
          to="/supervisor"
          className="top-link"
          style={{ marginLeft: '6px' }}
          title="Switch to Supervisor Workspace"
        >
          <Icon name="gear" />
          <span className="label-full">Supervisor</span>
        </Link>
        <Link
          to="/"
          className="top-link exit-btn"
          style={{ marginLeft: '4px' }}
          title="Return to Landing Page"
        >
          <Icon name="close" />
          <span className="label-full">Exit</span>
        </Link> */}
      </div>
    </header>
  );
}

function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">WORKSHOP NOTE / TECHNICIAN</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function CapturePage({
  onSave,
  storageError,
  onDismissStorageError,
}: {
  onSave: (draft: Draft) => Promise<void>;
  storageError: string | null;
  onDismissStorageError: () => void;
}) {
  const recorder = useAudioRecorder();
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [form, setForm] = useState(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [stage, setStage] = useState<CaptureStage>('capture');
  const [referenceId, setReferenceId] = useState('');
  /** Whether the observation just saved has a voice recording (decides if server-side processing is tracked). */
  const [savedHasAudio, setSavedHasAudio] = useState(false);

  const recording = recorder.status === 'recording';
  const paused = recorder.status === 'paused';
  const requesting = recorder.status === 'requesting';
  const preview = recorder.status === 'preview';

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.observation.trim() && !form.symptom.trim() && !recorder.audioBlob && files.length === 0) {
      setMessage('Add an observation, record audio, or attach media before saving.');
      setStage('review');
      return;
    }

    setSaving(true);

    const draftId = crypto.randomUUID();
    const recordedAt = new Date().toISOString();
    const audio = recorder.audioBlob ?? undefined;
    const audioMimeType = audio ? audio.type || recorder.mimeType || undefined : undefined;
    const currentUser = getCurrentUser();

    try {
      await onSave({
        ...form,
        id: draftId,
        date: recordedAt,
        recordedAt,
        mode: mode === 'voice' ? 'Voice' : 'Text',
        duration: recorder.durationMs,
        durationMs: recorder.durationMs,
        audio,
        audioType: audioMimeType,
        audioMimeType,
        audioSizeBytes: audio?.size,
        userId: currentUser?.id,
        attachments: files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          blob: file,
        })),
        syncStatus: 'pending',
      });

      setMessage('');
      setReferenceId(draftId);
      setSavedHasAudio(!!audio);
      setForm(emptyDraft());
      setFiles([]);
      recorder.discardRecording();
      setStage('success');
    } catch (error) {
      if (!(error instanceof DraftStorageError)) {
        setMessage('Could not save this draft. Check available device storage and try again.');
      } else {
        setMessage('');
      }
      setStage('review');
    } finally {
      setSaving(false);
    }
  };

  const startProcessing = async () => {
    if (!form.observation.trim() && !form.symptom.trim() && !recorder.audioBlob && files.length === 0) {
      setMessage('Add an observation, record audio, or attach media before continuing.');
      return;
    }

    onDismissStorageError();
    setConfirmed(true);
    setMessage('');
    // 'processing' now means exactly one real thing: writing the observation to this device (awaited below).
    // Upload, transcription and extraction are shown on the next screen from real server/device state.
    setStage('processing');

    await save();
  };

  return (
    <>
      <style>
        {`
          @keyframes technicianSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes technicianPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }

          .technician-processing-spinner {
            display: inline-flex;
            animation: technicianSpin 1.2s linear infinite;
          }

          .technician-processing-active {
            animation: technicianPulse 1.5s ease-in-out infinite;
          }

          .technician-flow-panel {
            width: 100%;
            max-width: 850px;
            margin: 0 auto;
          }

          .technician-processing-content {
            padding: 28px 10px;
            text-align: center;
          }

          .technician-processing-main-icon {
            width: 66px;
            height: 66px;
            margin: 0 auto 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff1e8;
            color: #f47720;
            font-size: 28px;
          }

          .technician-processing-list {
            max-width: 540px;
            margin: 30px auto 0;
            text-align: left;
          }

          .technician-processing-item {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 15px 16px;
            border-bottom: 1px solid #e8eef1;
          }

          .technician-processing-item:last-child {
            border-bottom: none;
          }

          .technician-processing-status {
            width: 28px;
            height: 28px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
          }

          .technician-processing-status.completed {
            color: #168653;
            background: #e7f6ed;
          }

          .technician-processing-status.active {
            color: #f47720;
            background: #fff1e8;
          }

          .technician-processing-status.pending {
            color: #9aa8ae;
            background: #f0f3f5;
          }

          .technician-success-icon {
            width: 68px;
            height: 68px;
            margin: 0 auto 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #e7f6ed;
            color: #168653;
            font-size: 30px;
          }

          .technician-reference {
            margin: 22px auto;
            padding: 14px;
            max-width: 460px;
            border: 1px solid #e3e9ec;
            border-radius: 10px;
            background: #f5f8fa;
            overflow-wrap: anywhere;
          }

          .technician-flow-actions {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 24px;
          }

          @media (max-width: 600px) {
            .technician-flow-panel {
              padding: 18px;
            }

            .technician-flow-actions {
              flex-direction: column;
            }

            .technician-flow-actions button {
              width: 100%;
            }
          }
        `}
      </style>

      <PageIntro
        title="Technician capture — Field Note"
        description="Record a voice note or enter text, add context, and attach media as needed."
      />

      {storageError && <StorageAlertBanner message={storageError} onDismiss={onDismissStorageError} />}

      <div
        className="capture-layout"
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {stage === 'capture' && (
          <section className="panel capture-panel technician-flow-panel">
            <div className="section-heading">
              <div>
                <h2>Capture observation</h2>
                <p>Start with what you noticed in the field.</p>
              </div>
              <span className="required-tag">30 sec max</span>
            </div>

            <div className="mode-switch">
              <button
                type="button"
                className={mode === 'voice' ? 'selected' : ''}
                onClick={() => setMode('voice')}
              >
                <Icon name="mic" /> Voice
              </button>
              <button
                type="button"
                className={mode === 'text' ? 'selected' : ''}
                onClick={() => setMode('text')}
              >
                <Icon name="file" /> Text
              </button>
            </div>

            {mode === 'voice' && (
              <div className={`voice-recorder ${recording ? 'recording' : ''} ${paused ? 'paused' : ''}`}>
                <button
                  type="button"
                  className={`mic-button ${recording ? 'live' : ''}`}
                  onClick={() => void recorder.startRecording()}
                  disabled={recording || paused || requesting || preview}
                  aria-label="Start voice recording"
                >
                  <Icon name="mic" />
                </button>
                <div className="timer-block">
                  <strong>
                    {formatDuration(recorder.durationMs)} <small>/ 00:30</small>
                  </strong>
                  <span>
                    {requesting
                      ? 'Requesting microphone access…'
                      : recording
                        ? 'Recording in progress'
                        : paused
                          ? 'Recording paused'
                          : preview
                            ? 'Preview ready'
                            : recorder.status === 'error'
                              ? 'Microphone needs attention'
                              : 'Ready when you are'}
                  </span>
                  <div className="progress-track">
                    <i style={{ width: `${Math.min(100, (recorder.durationMs / 30000) * 100)}%` }} />
                  </div>
                </div>
                <div className="voice-actions">
                  {requesting && (
                    <button type="button" className="button-primary" disabled>
                      Starting…
                    </button>
                  )}
                  {recording && (
                    <>
                      <button type="button" className="button-light" onClick={recorder.pauseRecording}>
                        <Icon name="pause" /> Pause
                      </button>
                      <button type="button" className="button-danger" onClick={recorder.stopRecording}>
                        <Icon name="stop" /> Finish
                      </button>
                    </>
                  )}
                  {paused && (
                    <>
                      <button type="button" className="button-primary" onClick={recorder.resumeRecording}>
                        <Icon name="play" /> Resume
                      </button>
                      <button type="button" className="button-danger" onClick={recorder.stopRecording}>
                        <Icon name="stop" /> Finish
                      </button>
                    </>
                  )}
                  {preview && (
                    <button type="button" className="button-light" onClick={recorder.discardRecording}>
                      <Icon name="refresh" /> Record again
                    </button>
                  )}
                  {!recording && !paused && !requesting && !preview && (
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void recorder.startRecording()}
                    >
                      <Icon name="mic" />
                      {recorder.status === 'error' ? 'Try again' : 'Start recording'}
                    </button>
                  )}
                </div>
                {recorder.errorMessage && <p className="error-message">{recorder.errorMessage}</p>}
                {preview && recorder.audioUrl && (
                  <div className="audio-preview">
                    <audio controls src={recorder.audioUrl} />
                    <a href={recorder.audioUrl} download="workshop-note-audio.webm">
                      <Icon name="download" /> Download audio
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="context-fields">
              <label className="field">
                <span>
                  Asset context <small>(optional)</small>
                </span>
                <div className="input-icon">
                  <Icon name="search" />
                  <input
                    placeholder="Search or select asset…"
                    value={form.equipment}
                    onChange={(e) => update('equipment', e.target.value)}
                  />
                  <Icon name="chevron" />
                </div>
              </label>

              <div className="field-row">
                <Field
                  label="Equipment class"
                  value={form.subsystem}
                  onChange={(value) => update('subsystem', value)}
                  placeholder="Select equipment class…"
                />
                <Field
                  label="Subsystem"
                  value={form.symptom}
                  onChange={(value) => update('symptom', value)}
                  placeholder="Select subsystem…"
                />
              </div>

              <div className="attach-row">
                <strong>
                  <Icon name="paperclip" /> Attach media <small>(optional)</small>
                </strong>
                <label className="attach-button">
                  <Icon name="camera" /> Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      setFiles((current) => [...current, ...Array.from(e.target.files ?? [])])
                    }
                  />
                </label>
                <label className="attach-button">
                  <Icon name="video" /> Video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) =>
                      setFiles((current) => [...current, ...Array.from(e.target.files ?? [])])
                    }
                  />
                </label>
                <label className="attach-button">
                  <Icon name="mic" /> Audio
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) =>
                      setFiles((current) => [...current, ...Array.from(e.target.files ?? [])])
                    }
                  />
                </label>
              </div>

              {files.length > 0 && (
                <div className="attached-files">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`}>
                      {file.name}
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Field
                label="Observation"
                value={form.observation}
                onChange={(value) => update('observation', value)}
                placeholder="Type or transcribe your observation here…"
                multiline
              />
            </div>

            <button
              type="button"
              className="button-primary save-button"
              onClick={() => {
                setMessage('');
                setStage('review');
              }}
            >
              <Icon name="check" /> Continue to review
            </button>

            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}
          </section>
        )}

        {stage === 'review' && (
          <section className="panel review-panel technician-flow-panel">
            <div className="section-heading">
              <div>
                <h2>Post-capture review</h2>
                <p>Review the captured information and complete the fields below.</p>
              </div>
              <span className={confirmed ? 'review-badge confirmed' : 'review-badge'}>
                {confirmed ? 'Confirmed' : 'Needs review'}
              </span>
            </div>

            <div className="review-fields">
              <Field
                label="Equipment"
                value={form.equipment}
                onChange={(value) => update('equipment', value)}
                placeholder="Enter equipment"
              />
              <Field
                label="Subsystem"
                value={form.subsystem}
                onChange={(value) => update('subsystem', value)}
                placeholder="Enter subsystem"
              />
              <Field
                label="Symptom"
                value={form.symptom}
                onChange={(value) => update('symptom', value)}
                placeholder="Describe the symptom"
              />
              <Field
                label="Probable cause"
                value={form.cause}
                onChange={(value) => update('cause', value)}
                placeholder="Add probable cause"
              />
              <Field
                label="Action taken"
                value={form.action}
                onChange={(value) => update('action', value)}
                placeholder="Describe action taken"
              />
              <Field
                label="Parts used"
                value={form.parts}
                onChange={(value) => update('parts', value)}
                placeholder="List parts used"
              />
              <Field
                label="Safety notes"
                value={form.safety}
                onChange={(value) => update('safety', value)}
                placeholder="Add safety notes"
              />
            </div>

            <div className="review-actions">
              <button
                type="button"
                className="button-light"
                onClick={() => {
                  setConfirmed(false);
                  setMessage('');
                  setStage('capture');
                }}
              >
                <Icon name="edit" /> Correct
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => void startProcessing()}
                disabled={saving}
              >
                <Icon name="check" /> Confirm and continue
              </button>
            </div>

            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}

            <div className="review-note">
              <Icon name="shield" />
              <span>Similarity is not a diagnosis. Follow approved plant procedures and verify findings.</span>
            </div>
          </section>
        )}

        {stage === 'processing' && (
          <section className="panel technician-flow-panel">
            <div className="technician-processing-content">
              <div className="technician-processing-main-icon">
                <span className="technician-processing-spinner">
                  <Icon name="refresh" />
                </span>
              </div>

              <h2>Saving your observation</h2>
              <p className="technician-processing-active">Saving on this device…</p>
              <p className="storage-hint" style={{ marginTop: '24px' }}>
                Next you will see the real upload, transcription and extraction progress from the server.
              </p>
            </div>
          </section>
        )}

        {stage === 'success' && (
          <section className="panel technician-flow-panel">
            <div className="technician-processing-content">
              <div className="technician-success-icon">
                <Icon name="check" />
              </div>

              <h2>Observation saved on this device.</h2>
              <p>
                {savedHasAudio
                  ? 'Your recording is uploading and being processed. The steps below show the real status from the server.'
                  : 'Your observation has been saved on this device.'}
              </p>

              <div className="technician-reference">
                <span className="eyebrow">LOCAL CASE ID</span>
                <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
                  {referenceId}
                </p>
              </div>

              <CaptureProgress key={referenceId} draftId={referenceId} hasAudio={savedHasAudio} />

              <p className="storage-hint">
                Notes, audio, and attachments sync automatically in the background when online and signed in. Offline recordings are kept on this device and upload when you reconnect.
              </p>

              <div className="technician-flow-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    setStage('capture');
                    setReferenceId('');
                    setMessage('');
                    setConfirmed(false);
                  }}
                >
                  <Icon name="file" /> New Observation
                </button>
                <button
                  type="button"
                  className="button-light"
                  onClick={() => window.location.assign('/technician')}
                >
                  <Icon name="arrow-left" /> Back to Dashboard
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function SyncStatusBadge({ status }: { status: DraftSyncStatus }) {
  const stylesByStatus: Record<DraftSyncStatus, { label: string; color: string; background: string }> = {
    pending: { label: 'Pending', color: '#98621f', background: '#fff1dc' },
    uploading: { label: 'Uploading', color: '#08677a', background: '#e7f2f4' },
    completed: { label: 'Completed', color: '#25845a', background: '#e5f4eb' },
    failed: { label: 'Failed', color: '#b84a3a', background: '#fbe9e6' },
  };
  const style = stylesByStatus[status];
  return (
    <span
      className="pending-tag"
      data-sync-status={status}
      style={{
        color: style.color,
        background: style.background,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  );
}

function DraftMedia({
  draft,
  mediaUrls,
  serverAudioUrl,
  onDownloadServerAttachment,
}: {
  draft: DisplayDraft;
  mediaUrls?: DraftMediaUrls;
  serverAudioUrl?: string;
  onDownloadServerAttachment: (serverDraftId: string, att: ServerAttachmentMeta) => void;
}) {
  const audioUrl = mediaUrls?.audioUrl ?? serverAudioUrl;
  const attachmentUrls = mediaUrls?.attachmentUrls ?? [];
  const serverAttachments = draft.attachments.length === 0 ? (draft.serverAttachments ?? []) : [];

  if (!audioUrl && draft.attachments.length === 0 && serverAttachments.length === 0) return null;

  return (
    <div className="draft-media">
      {audioUrl && <audio controls src={audioUrl} />}
      {draft.attachments.map((file, index) => {
        const href = attachmentUrls[index];
        if (!href) return null;
        return (
          <a key={`${file.name}-${index}`} href={href} download={file.name}>
            {file.name}
          </a>
        );
      })}
      {draft.serverDraftId &&
        serverAttachments.map((att) => (
          <button
            key={att.id}
            type="button"
            className="button-light"
            style={{ minHeight: '28px', padding: '4px 10px', fontSize: '12px' }}
            onClick={() => onDownloadServerAttachment(draft.serverDraftId!, att)}
          >
            <Icon name="download" /> {att.file_name}
          </button>
        ))}
    </div>
  );
}

function DraftsPage({
  drafts,
  online,
  loadingServer,
  quotaStatus,
  storageError,
  onDismissStorageError,
  onRemove,
  onRetry,
  onRefreshServer,
  onRecover,
  onNavigateToCapture,
}: {
  drafts: DisplayDraft[];
  online: boolean;
  loadingServer: boolean;
  quotaStatus: StorageQuotaStatus | null;
  storageError: string | null;
  onDismissStorageError: () => void;
  onRemove: (draft: DisplayDraft) => void;
  onRetry: (id: string) => void;
  onRefreshServer: () => void;
  onRecover: () => void;
  onNavigateToCapture: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({});
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  const retryProcessing = useCallback(
    async (recordingId: string) => {
      setRetryingIds((cur) => ({ ...cur, [recordingId]: true }));
      setRetryErrors((cur) => {
        const next = { ...cur };
        delete next[recordingId];
        return next;
      });
      const outcome = await processServerRecordingRequest(recordingId);
      setRetryingIds((cur) => ({ ...cur, [recordingId]: false }));
      if (!outcome.ok) {
        setRetryErrors((cur) => ({
          ...cur,
          [recordingId]: outcome.authError
            ? 'Your session expired. Sign in again to retry.'
            : (outcome.errorMessage ?? 'Could not restart processing. Please try again.'),
        }));
      }
      onRefreshServer();
    },
    [onRefreshServer],
  );
  const [mediaUrlsById, setMediaUrlsById] = useState<Record<string, DraftMediaUrls>>({});
  const [serverAudioUrlsById, setServerAudioUrlsById] = useState<Record<string, string>>({});
  const activeUrlsRef = useRef<Map<string, DraftMediaUrls>>(new Map());
  const serverAudioUrlsRef = useRef<Map<string, string>>(new Map());

  const revokeEntry = useCallback((entry?: DraftMediaUrls) => {
    if (!entry) return;
    if (entry.audioUrl) URL.revokeObjectURL(entry.audioUrl);
    for (const url of entry.attachmentUrls) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const revokeAllActiveUrls = useCallback(() => {
    for (const entry of activeUrlsRef.current.values()) {
      revokeEntry(entry);
    }
    activeUrlsRef.current.clear();
    setMediaUrlsById({});
  }, [revokeEntry]);

  const visible = useMemo(
    () => drafts.filter((draft) => filter === 'all' || draft.mode.toLowerCase() === filter),
    [drafts, filter],
  );

  useEffect(() => {
    let cancelled = false;
    const nextMap = new Map<string, DraftMediaUrls>();
    const nextRecord: Record<string, DraftMediaUrls> = {};

    for (const draft of visible) {
      const audioUrl = draft.audio ? URL.createObjectURL(draft.audio) : undefined;
      const attachmentUrls = draft.attachments.map((file) => URL.createObjectURL(file.blob));
      const entry: DraftMediaUrls = { audioUrl, attachmentUrls };
      nextMap.set(draft.id, entry);
      nextRecord[draft.id] = entry;
    }

    activeUrlsRef.current = nextMap;
    void Promise.resolve().then(() => {
      if (!cancelled) setMediaUrlsById(nextRecord);
    });

    return () => {
      cancelled = true;
      for (const entry of nextMap.values()) {
        revokeEntry(entry);
      }
      if (activeUrlsRef.current === nextMap) {
        activeUrlsRef.current = new Map();
      }
    };
  }, [visible, revokeEntry]);

  useEffect(() => {
    if (!online || !getAccessToken()) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    const localAudioUrls = new Map<string, string>();

    const candidates = visible.filter((d) => !d.audio && d.serverRecordingId);
    if (candidates.length === 0) return undefined;

    void Promise.all(
      candidates.map(async (d) => {
        try {
          const url = await fetchRecordingAudioUrl(d.serverRecordingId!, controller.signal);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          localAudioUrls.set(d.id, url);
        } catch {
          /* ignore transient/offline audio preview failures */
        }
      }),
    ).then(() => {
      if (cancelled) return;
      serverAudioUrlsRef.current = localAudioUrls;
      const rec: Record<string, string> = {};
      for (const [k, v] of localAudioUrls.entries()) rec[k] = v;
      setServerAudioUrlsById(rec);
    });

    return () => {
      cancelled = true;
      controller.abort();
      for (const url of localAudioUrls.values()) {
        URL.revokeObjectURL(url);
      }
      if (serverAudioUrlsRef.current === localAudioUrls) {
        serverAudioUrlsRef.current = new Map();
      }
    };
  }, [visible, online]);

  const handleDownloadServerAttachment = useCallback(async (serverDraftId: string, att: ServerAttachmentMeta) => {
    try {
      const blobUrl = await fetchAttachmentBlobUrl(serverDraftId, att.id);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = att.file_name;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch {
      /* ignore failed download click */
    }
  }, []);

  const handleRemove = (draft: DisplayDraft) => {
    const entry = activeUrlsRef.current.get(draft.id);
    if (entry) {
      revokeEntry(entry);
      activeUrlsRef.current.delete(draft.id);
    }
    onRemove(draft);
  };

  const handleRecover = () => {
    revokeAllActiveUrls();
    onRecover();
  };

  return (
    <>
      <PageIntro
        title="Technician saved notes"
        description="Manage locally saved and server-synced notes, review observations, and track review status."
      />
      {storageError && <StorageAlertBanner message={storageError} onDismiss={onDismissStorageError} />}
      <section className="panel drafts-panel">
        <div className="draft-toolbar">
          <div>
            <h2>Saved notes (drafts){loadingServer ? ' · Refreshing…' : ''}</h2>
            <p>Notes and media saved on this device and synced with the server.</p>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
              <button type="button" className="button-light" onClick={handleRecover}>
                <Icon name="refresh" /> Refresh &amp; recover drafts
              </button>
              {quotaStatus && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: '1px solid #dce8ec',
                    background: '#f2f7f9',
                    color: '#526b75',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="database" style={{ width: '14px', height: '14px', color: '#08677a' }} />
                  {quotaStatus.quotaBytes > 0
                    ? `Storage: ${formatBytes(quotaStatus.usageBytes)} / ${formatBytes(quotaStatus.quotaBytes)} (${quotaStatus.percentUsed.toFixed(1)}%)`
                    : `Storage: ${formatBytes(quotaStatus.usageBytes)} used`}
                  {quotaStatus.isPersisted ? ' · Persistent' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="filter-tabs">
            <button
              type="button"
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={filter === 'voice' ? 'active' : ''}
              onClick={() => setFilter('voice')}
            >
              Voice
            </button>
            <button
              type="button"
              className={filter === 'text' ? 'active' : ''}
              onClick={() => setFilter('text')}
            >
              Text
            </button>
          </div>
        </div>

        {visible.length ? (
          <div className="draft-list">
            {visible.map((draft) => {
              const syncStatus = normalizeSyncStatusLabel(draft.syncStatus);
              const durationMs = draft.durationMs ?? draft.duration;
              const audioBytes = draft.audioSizeBytes ?? draft.audio?.size ?? 0;
              const attachmentCount = draft.attachments.length || draft.serverAttachments?.length || 0;
              const attachmentBytes =
                draft.attachments.length > 0
                  ? draft.attachments.reduce((sum, item) => sum + (item.size ?? item.blob.size ?? 0), 0)
                  : (draft.serverAttachments ?? []).reduce((sum, item) => sum + item.size_bytes, 0);

              return (
                <article className="draft-item" key={draft.id}>
                  <span className="draft-icon">
                    <Icon name={draft.mode.toLowerCase() === 'voice' ? 'mic' : 'file'} />
                  </span>
                  <div className="draft-copy">
                    <strong>{draft.equipment || 'Field observation'}</strong>
                    <p>{draft.observation || draft.symptom || draft.transcriptionText || 'No observation text added'}</p>
                    <small>
                      {new Date(draft.recordedAt ?? draft.date).toLocaleString()} · {draft.mode}
                      {durationMs > 0 ? ` · ${formatDuration(durationMs)}` : ''}
                      {audioBytes > 0 ? ` · Audio ${formatBytes(audioBytes)}` : ''}
                      {attachmentCount > 0 ? ` · ${attachmentCount} file(s) (${formatBytes(attachmentBytes)})` : ''}
                      {draft.serverStatus ? ` · Review: ${draft.serverStatus}` : ''}
                      {draft.recordingStatus ? ` · Pipeline: ${draft.recordingStatus}` : ''}
                      {draft.isServerOnly ? ' · Cloud copy' : ''}
                    </small>
                    {draft.pipeline && (
                      <PipelineStatus
                        snapshot={draft.pipeline}
                        retrying={!!retryingIds[draft.pipeline.recordingId]}
                        retryError={retryErrors[draft.pipeline.recordingId]}
                        onRetry={() => void retryProcessing(draft.pipeline!.recordingId)}
                      />
                    )}
                    {!draft.pipeline && draft.transcriptionText && (
                      <small style={{ display: 'block', color: '#08677a', marginTop: '4px' }}>
                        Transcript: {draft.transcriptionText}
                      </small>
                    )}
                    {draft.reviewComment && (
                      <small style={{ display: 'block', color: '#526b75', marginTop: '4px' }}>
                        Supervisor note: {draft.reviewComment}
                      </small>
                    )}
                    {syncStatus === 'failed' && draft.lastError && (
                      <small style={{ display: 'block', color: '#b84a3a', marginTop: '4px' }}>
                        Sync error: {draft.lastError}
                      </small>
                    )}
                    <DraftMedia
                      draft={draft}
                      mediaUrls={mediaUrlsById[draft.id]}
                      serverAudioUrl={serverAudioUrlsById[draft.id]}
                      onDownloadServerAttachment={(sId, att) => void handleDownloadServerAttachment(sId, att)}
                    />
                  </div>
                  <SyncStatusBadge status={syncStatus} />
                  {syncStatus === 'failed' && !draft.isServerOnly && (
                    <button
                      type="button"
                      className="button-light"
                      aria-label="Retry sync"
                      onClick={() => onRetry(draft.id)}
                      style={{ minHeight: '34px', padding: '6px 10px' }}
                    >
                      <Icon name="refresh" /> Retry
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Delete draft"
                    onClick={() => handleRemove(draft)}
                  >
                    <Icon name="trash" />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="file" />
            </span>
            <h3>No saved notes yet</h3>
            <p>Notes you save from Capture will appear here and sync automatically with the server.</p>
            <button type="button" className="button-primary" onClick={onNavigateToCapture}>
              Go to capture
            </button>
          </div>
        )}
      </section>
      <p className="storage-hint">
        Saved notes, audio, and attachments stay stored locally on this device and sync automatically when online and signed in.
      </p>
    </>
  );
}

function SearchPage({ online }: { online: boolean }) {
  const [query, setQuery] = useState('');
  const [equipment, setEquipment] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseResults, setCaseResults] = useState<ServerCaseItem[]>([]);
  const [draftResults, setDraftResults] = useState<ServerDraftDetail[]>([]);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!online || !getAccessToken()) {
      setError('Connect to the network and sign in to search server cases and notes.');
      setSearched(true);
      return;
    }
    setSearching(true);
    setError(null);
    setSearched(true);
    try {
      const [casesRes, draftsRes] = await Promise.all([
        searchServerCases({ q: trimmed, equipment_class_id: equipment.trim() || undefined, limit: 20 }),
        listServerDrafts({ q: trimmed, limit: 20 }),
      ]);
      setCaseResults(casesRes.items);
      setDraftResults(draftsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <PageIntro
        title="Technician search cases"
        description="Search live operational cases and synced field notes to support troubleshooting."
      />
      <div className="search-layout">
        <section className="panel search-form">
          <h2>Search cases</h2>
          <Field
            label="Symptom / issue (required)"
            value={query}
            onChange={setQuery}
            placeholder="Describe the symptom or issue…"
            multiline
          />
          <Field
            label="Equipment class filter (optional)"
            value={equipment}
            onChange={setEquipment}
            placeholder="e.g. EQ-PUMP"
          />
          <div className="search-actions">
            <button
              type="button"
              className="button-primary"
              disabled={!query.trim() || searching}
              onClick={() => void runSearch()}
            >
              <Icon name="search" /> {searching ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              className="button-light"
              onClick={() => {
                setQuery('');
                setEquipment('');
                setSearched(false);
                setError(null);
                setCaseResults([]);
                setDraftResults([]);
              }}
            >
              <Icon name="refresh" /> Clear
            </button>
          </div>
          <div className="review-note">
            <Icon name="info" /> Similarity is not a diagnosis.
          </div>
        </section>

        <section className="panel results-panel">
          <div className="results-heading">
            <h2>Search results</h2>
            <span>{searched ? `${caseResults.length + draftResults.length} match(es)` : 'Case library'}</span>
          </div>
          {error && <StorageAlertBanner message={error} onDismiss={() => setError(null)} />}
          {!searched ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="search" />
              </span>
              <h3>Search for cases</h3>
              <p>Enter a symptom or keyword and click Search to query live server cases and synced notes.</p>
            </div>
          ) : searching ? (
            <p className="storage-hint">Searching server records…</p>
          ) : caseResults.length === 0 && draftResults.length === 0 ? (
            <div className="empty-state compact">
              <span className="empty-icon">
                <Icon name="database" />
              </span>
              <h3>No matching records</h3>
              <p>No operational cases or synced drafts matched "{query}".</p>
            </div>
          ) : (
            <div className="draft-list">
              {caseResults.map((c) => (
                <article className="draft-item" key={c.case_id}>
                  <span className="draft-icon">
                    <Icon name="database" />
                  </span>
                  <div className="draft-copy">
                    <strong>{c.case_reference} · {c.case_title || c.equipment_class_id}</strong>
                    <p>{c.symptom_text}</p>
                    <small>
                      Status: {c.case_status}
                      {c.primary_suspected_cause ? ` · Cause: ${c.primary_suspected_cause}` : ''}
                    </small>
                  </div>
                </article>
              ))}
              {draftResults.map((d) => (
                <article className="draft-item" key={d.id}>
                  <span className="draft-icon">
                    <Icon name={d.capture_mode === 'voice' ? 'mic' : 'file'} />
                  </span>
                  <div className="draft-copy">
                    <strong>{d.equipment || 'Synced field note'}</strong>
                    <p>{d.observation || d.symptom || '(No text)'}</p>
                    <small>Note · {d.status} · {new Date(d.created_at).toLocaleString()}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ProfilePage({ online }: { online: boolean }) {
  const user = getCurrentUser();
  const initial = (user?.name?.[0] ?? 'T').toUpperCase();

  return (
    <>
      <PageIntro
        title="Technician profile"
        description="View technician details and connection status."
      />
      <section className="panel profile-card">
        <div className="profile-main">
          <div className="profile-avatar">{initial}</div>
          <div>
            <h2>{user?.name ?? 'Technician account'}</h2>
            <p>
              <Icon name="gear" /> Role: {user?.role ?? 'TECHNICIAN'}
            </p>
            <span className={online ? 'profile-online' : 'profile-offline'}>
              <i />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          <span className="signed-in">
            <Icon name="info" /> {user ? 'Profile active' : 'Session unavailable'}
          </span>
        </div>
        <div className="contact-section">
          <div className="contact-title">
            <Icon name="user" />
            <div>
              <h3>Account details</h3>
              <p>Authenticated technician details from the sign-in service.</p>
            </div>
          </div>
          <div className="contact-row">
            <Icon name="mail" />
            <strong>Email</strong>
            <span>{user?.email ?? 'Not signed in'}</span>
          </div>
          <div className="contact-row">
            <Icon name="gear" />
            <strong>User ID</strong>
            <span>{user?.id ?? '—'}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export const TechnicianPage: React.FC = () => {
  const online = useNetworkStatus();
  const { syncState, triggerSync } = useSyncStatus();
  const currentUserId = getCurrentUser()?.id;
  const [page, setPage] = useState<Page>('capture');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [serverDrafts, setServerDrafts] = useState<ServerDraftDetail[]>([]);
  const [loadingServer, setLoadingServer] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<StorageQuotaStatus | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);

  const refreshQuotaStatus = useCallback(async () => {
    try {
      const status = await getStorageQuotaStatus();
      setQuotaStatus(status);
    } catch {
      /* Ignore storage quota estimate unavailability */
    }
  }, []);

  const loadScopedDrafts = useCallback(async (): Promise<Draft[]> => {
    const allDrafts = await getDrafts();
    return scopeDraftsToUser(allDrafts, currentUserId);
  }, [currentUserId]);

  const refreshServerDrafts = useCallback(async (silent = false) => {
    if (!navigator.onLine || !getAccessToken()) return;
    if (!silent) setLoadingServer(true);
    try {
      const res = await listServerDrafts({ limit: 50, offset: 0 });
      setServerDrafts(res.items);
    } catch {
      /* Ignore background fetch failures while offline or expired */
    } finally {
      if (!silent) setLoadingServer(false);
    }
  }, []);

  const recover = async () => {
    try {
      const saved = await loadScopedDrafts();
      setDrafts(saved);
      setStorageError(null);
      setStorageReady(true);
      await Promise.all([refreshQuotaStatus(), refreshServerDrafts()]);
      setNotice('Offline and server drafts refreshed.');
      setTimeout(() => setNotice(''), 2500);
    } catch (error) {
      setStorageError(
        extractStorageErrorMessage(error, 'Local draft storage is unavailable in this browser.'),
      );
      setStorageReady(true);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([loadScopedDrafts(), getStorageQuotaStatus()])
      .then(([saved, quota]) => {
        if (!active) return;
        setDrafts(saved);
        setQuotaStatus(quota);
        setStorageError(null);
      })
      .catch((error) => {
        if (!active) return;
        setStorageError(
          extractStorageErrorMessage(error, 'Local draft storage is unavailable in this browser.'),
        );
      })
      .finally(() => {
        if (active) setStorageReady(true);
      });
    void Promise.resolve().then(() => {
      if (active) return refreshServerDrafts();
    });
    return () => {
      active = false;
    };
  }, [loadScopedDrafts, refreshServerDrafts]);

  useEffect(() => {
    if (page === 'drafts' && online && getAccessToken()) {
      let active = true;
      void Promise.resolve().then(() => {
        if (active) return refreshServerDrafts();
      });
      return () => {
        active = false;
      };
    }
  }, [page, online, refreshServerDrafts]);

  // Poll while any uploaded recording is still being transcribed/extracted, so the technician sees real progress.
  const hasInFlightRecording = serverDrafts.some((s) => isInFlightStatus(s.recording?.processing_status));
  useEffect(() => {
    if (page !== 'drafts' || !online || !hasInFlightRecording) return;
    const timer = window.setInterval(() => void refreshServerDrafts(true), 5000);
    return () => window.clearInterval(timer);
  }, [page, online, hasInFlightRecording, refreshServerDrafts]);

  useEffect(() => {
    if (syncState.revision === 0) return;
    let active = true;
    void loadScopedDrafts()
      .then((saved) => {
        if (!active) return;
        setDrafts(saved);
        return Promise.all([refreshQuotaStatus(), refreshServerDrafts()]);
      })
      .catch(() => {
        /* Ignore background refresh failures; explicit user actions surface storage errors. */
      });
    return () => {
      active = false;
    };
  }, [syncState.revision, loadScopedDrafts, refreshQuotaStatus, refreshServerDrafts]);

  const mergedDrafts = useMemo<DisplayDraft[]>(() => {
    const serverByClientId = new Map<string, ServerDraftDetail>();
    for (const s of serverDrafts) {
      serverByClientId.set(s.client_draft_id, s);
    }
    const seenClientIds = new Set<string>();
    const combined: DisplayDraft[] = drafts.map((local) => {
      seenClientIds.add(local.id);
      const match = serverByClientId.get(local.id);
      return {
        ...local,
        ...(match
          ? {
              serverDraftId: local.serverDraftId ?? match.id,
              serverRecordingId: local.serverRecordingId ?? match.recording_id ?? undefined,
              serverStatus: match.status,
              recordingStatus: match.recording?.processing_status,
              pipeline: buildPipelineSnapshot(match),
              transcriptionText: match.transcription?.transcript ?? null,
              reviewComment: match.review_comment,
              serverAttachments: match.attachments,
            }
          : {}),
      };
    });

    for (const s of serverDrafts) {
      if (seenClientIds.has(s.client_draft_id)) continue;
      combined.push({
        id: s.client_draft_id,
        date: s.recorded_at ?? s.created_at,
        recordedAt: s.recorded_at ?? s.created_at,
        createdAt: Date.parse(s.client_created_at ?? s.created_at),
        updatedAt: Date.parse(s.client_updated_at ?? s.updated_at),
        observation: s.observation,
        equipment: s.equipment,
        subsystem: s.subsystem,
        symptom: s.symptom,
        cause: s.probable_cause,
        action: s.action_taken,
        parts: s.parts_used,
        safety: s.safety_notes,
        mode: s.capture_mode === 'voice' ? 'Voice' : 'Text',
        duration: s.duration_ms ?? 0,
        durationMs: s.duration_ms ?? 0,
        audioSizeBytes: s.recording?.size_bytes,
        audioMimeType: s.recording?.mime_type,
        attachments: [],
        syncStatus: 'completed',
        userId: s.created_by,
        serverDraftId: s.id,
        serverRecordingId: s.recording_id ?? undefined,
        isServerOnly: true,
        serverStatus: s.status,
        recordingStatus: s.recording?.processing_status,
        pipeline: buildPipelineSnapshot(s),
        transcriptionText: s.transcription?.transcript ?? null,
        reviewComment: s.review_comment,
        serverAttachments: s.attachments,
      });
    }

    return combined.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [drafts, serverDrafts]);

  const save = async (draft: Draft) => {
    try {
      await saveDraft(draft);
      setStorageError(null);
      try {
        const refreshed = await loadScopedDrafts();
        setDrafts(refreshed);
      } catch {
        setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      }
      await refreshQuotaStatus();
      if (navigator.onLine) {
        void syncPendingDrafts();
      }
    } catch (error) {
      const message = extractStorageErrorMessage(
        error,
        'Could not save this draft. Check available device storage and try again.',
      );
      setStorageError(message);
      throw error;
    }
  };

  const retry = async (id: string) => {
    try {
      await retryFailedDraft(id);
      setStorageError(null);
      const refreshed = await loadScopedDrafts();
      setDrafts(refreshed);
      if (navigator.onLine) {
        void syncPendingDrafts({ manual: true });
      }
    } catch (error) {
      setStorageError(
        extractStorageErrorMessage(error, 'Could not reset this draft for retry.'),
      );
    }
  };

  const remove = async (draft: DisplayDraft) => {
    try {
      if (!draft.isServerOnly) {
        await deleteDraft(draft.id);
        setDrafts((current) => current.filter((item) => item.id !== draft.id));
      }
      if (draft.serverDraftId && navigator.onLine && getAccessToken()) {
        try {
          await deleteServerDraft(draft.serverDraftId);
          setServerDrafts((current) => current.filter((item) => item.id !== draft.serverDraftId));
        } catch (err) {
          if (err instanceof Error && !err.message.includes('404')) {
            setStorageError(err.message);
            return;
          }
        }
      }
      setStorageError(null);
      await refreshQuotaStatus();
    } catch (error) {
      setStorageError(
        extractStorageErrorMessage(error, 'Could not delete this draft.'),
      );
    }
  };

  const pendingCount = useMemo(
    () =>
      drafts.filter((draft) => {
        const status = normalizeSyncStatusLabel(draft.syncStatus);
        return status === 'pending' || status === 'uploading';
      }).length,
    [drafts],
  );

  const title = useMemo(
    () =>
    ({
      capture: 'Capture',
      drafts: 'Drafts',
      search: 'Search cases',
      profile: 'Profile',
    }[page]),
    [page]
  );

  return (
    <div className="workshop-page">
      <Header
        page={page}
        online={online}
        draftsCount={mergedDrafts.length}
        pendingCount={pendingCount}
        syncState={syncState}
        onSyncNow={() => void triggerSync()}
        navigate={setPage}
      />

      <main className="workspace">
        <div className="mobile-page-label">
          <span>{title}</span>
          <Status online={online} />
        </div>

        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
        {!storageReady && <p className="storage-hint">Restoring saved drafts…</p>}

        {page === 'capture' && (
          <CapturePage
            onSave={save}
            storageError={storageError}
            onDismissStorageError={() => setStorageError(null)}
          />
        )}
        {page === 'drafts' && (
          <DraftsPage
            drafts={mergedDrafts}
            online={online}
            loadingServer={loadingServer}
            quotaStatus={quotaStatus}
            storageError={storageError}
            onDismissStorageError={() => setStorageError(null)}
            onRemove={(draft) => void remove(draft)}
            onRetry={(id) => void retry(id)}
            onRefreshServer={() => void refreshServerDrafts(true)}
            onRecover={() => void recover()}
            onNavigateToCapture={() => setPage('capture')}
          />
        )}
        {page === 'search' && <SearchPage online={online} />}
        {page === 'profile' && <ProfilePage online={online} />}
      </main>

      <nav className="mobile-nav" aria-label="Technician navigation">
        {(['capture', 'drafts', 'search', 'profile'] as Page[]).map((item) => (
          <button
            key={item}
            type="button"
            className={page === item ? 'active' : ''}
            onClick={() => setPage(item)}
          >
            <Icon
              name={
                item === 'capture'
                  ? 'mic'
                  : item === 'drafts'
                    ? 'file'
                    : item === 'search'
                      ? 'search'
                      : 'user'
              }
            />
            <span>
              {item === 'search'
                ? 'Search cases'
                : item === 'drafts' && mergedDrafts.length > 0
                  ? `Drafts (${mergedDrafts.length})`
                  : item[0].toUpperCase() + item.slice(1)}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default TechnicianPage;
