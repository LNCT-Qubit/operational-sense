import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { clearSession, getCurrentUser } from '../api/session';
import { formatDuration, useAudioRecorder } from '../features/useAudioRecorder';
import { deleteDraft, getDrafts, saveDraft, type TechnicianDraft } from '../features/draftStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Brand } from '../component/technicainComponent/Brand';
import { Icon } from '../component/technicainComponent/Icons';

type Page = 'capture' | 'drafts' | 'search' | 'profile';
type Draft = TechnicianDraft;

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

function Header({
  page,
  online,
  draftsCount,
  navigate,
}: {
  page: Page;
  online: boolean;
  draftsCount: number;
  navigate: (page: Page) => void;
}) {
  const navigateToRoute = useNavigate();
  const currentUser = getCurrentUser();
  const logout = () => { clearSession(); navigateToRoute('/', { replace: true }); };
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
        <span className="sync-state">
          <Icon name="refresh" /> Sync idle
        </span>
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

function CapturePage({ onSave }: { onSave: (draft: Draft) => Promise<void> }) {
  const recorder = useAudioRecorder();
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [form, setForm] = useState(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const recording = recorder.status === 'recording';
  const paused = recorder.status === 'paused';
  const requesting = recorder.status === 'requesting';
  const preview = recorder.status === 'preview';

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.observation.trim() && !form.symptom.trim() && !recorder.audioBlob && files.length === 0) {
      setMessage('Add an observation, record audio, or attach media before saving.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        mode: mode === 'voice' ? 'Voice' : 'Text',
        duration: recorder.durationMs,
        audio: recorder.audioBlob ?? undefined,
        audioType: recorder.mimeType ?? undefined,
        attachments: files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          blob: file,
        })),
        syncStatus: 'local',
      });
      setMessage('Draft and media saved securely on this device.');
      setForm(emptyDraft());
      setFiles([]);
      recorder.discardRecording();
    } catch {
      setMessage('Could not save this draft. Check available device storage and try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = () => {
    setConfirmed(true);
    setMessage('Review marked as confirmed.');
  };

  return (
    <>
      <PageIntro
        title="Technician capture — Field Note"
        description="Record a voice note or enter text, add context, and attach media as needed."
      />
      <div className="capture-layout">
        <section className="panel capture-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">STEP 01</span>
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
            onClick={() => void save()}
            disabled={saving}
          >
            <Icon name="file" /> {saving ? 'Saving draft…' : 'Save locally as draft'}
          </button>
          <p className="storage-hint">
            Text, voice recordings, and attached media are stored on this device for offline recovery.
          </p>

          {message && (
            <p
              className={
                message.startsWith('Draft') || message.startsWith('Review')
                  ? 'success-message'
                  : 'form-message'
              }
              role="status"
            >
              {message}
            </p>
          )}
        </section>

        <section className="panel review-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">STEP 02</span>
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
                setMessage('Review fields are ready to edit.');
              }}
            >
              <Icon name="edit" /> Correct
            </button>
            <button type="button" className="button-primary" onClick={confirm}>
              <Icon name="check" /> Confirm
            </button>
          </div>

          <div className="review-note">
            <Icon name="shield" />
            <span>Similarity is not a diagnosis. Follow approved plant procedures and verify findings.</span>
          </div>
        </section>
      </div>
    </>
  );
}

function AttachmentLink({ file }: { file: Draft['attachments'][number] }) {
  const url = useMemo(() => URL.createObjectURL(file.blob), [file.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <a href={url} download={file.name}>
      {file.name}
    </a>
  );
}

function DraftMedia({ draft }: { draft: Draft }) {
  const audioUrl = useMemo(
    () => (draft.audio ? URL.createObjectURL(draft.audio) : ''),
    [draft.audio]
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );

  return (
    <div className="draft-media">
      {audioUrl && <audio controls src={audioUrl} />}
      {draft.attachments.map((file, index) => (
        <AttachmentLink key={`${file.name}-${index}`} file={file} />
      ))}
    </div>
  );
}

function DraftsPage({
  drafts,
  onRemove,
  onRecover,
  onNavigateToCapture,
}: {
  drafts: Draft[];
  onRemove: (id: string) => void;
  onRecover: () => void;
  onNavigateToCapture: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const visible = drafts.filter((draft) => filter === 'all' || draft.mode.toLowerCase() === filter);

  return (
    <>
      <PageIntro
        title="Technician saved notes"
        description="Manage locally saved notes, review observations, and continue when you're ready."
      />
      <section className="panel drafts-panel">
        <div className="draft-toolbar">
          <div>
            <h2>Saved notes (drafts)</h2>
            <p>Notes and media saved locally on this device.</p>
            <button type="button" className="button-light" onClick={onRecover} style={{ marginTop: '8px' }}>
              <Icon name="refresh" /> Recover offline drafts
            </button>
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
            {visible.map((draft) => (
              <article className="draft-item" key={draft.id}>
                <span className="draft-icon">
                  <Icon name={draft.mode === 'Voice' ? 'mic' : 'file'} />
                </span>
                <div className="draft-copy">
                  <strong>{draft.equipment || 'Field observation'}</strong>
                  <p>{draft.observation || draft.symptom || 'No observation text added'}</p>
                  <small>
                    {new Date(draft.date).toLocaleString()} · {draft.mode}
                    {draft.duration ? ` · ${formatDuration(draft.duration)}` : ''}
                  </small>
                  <DraftMedia draft={draft} />
                </div>
                <span className="pending-tag">Saved locally</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Delete draft"
                  onClick={() => onRemove(draft.id)}
                >
                  <Icon name="trash" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="file" />
            </span>
            <h3>No saved notes yet</h3>
            <p>Notes you save from Capture will appear here. You can review or remove them from this device.</p>
            <button type="button" className="button-primary" onClick={onNavigateToCapture}>
              Go to capture
            </button>
          </div>
        )}
      </section>
      <p className="storage-hint">
        Saved notes, audio, and attachments remain on this device until a sync service is connected.
      </p>
    </>
  );
}

function SearchPage() {
  const [query, setQuery] = useState('');
  const [asset, setAsset] = useState('');
  const [equipment, setEquipment] = useState('');
  const [subsystem, setSubsystem] = useState('');
  const [searched, setSearched] = useState(false);

  return (
    <>
      <PageIntro
        title="Technician search cases"
        description="Find similar past cases to support troubleshooting."
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
          <label className="field">
            <span>
              Asset context <small>(optional)</small>
            </span>
            <div className="input-icon">
              <Icon name="search" />
              <input
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder="Search or browse equipment…"
              />
              <Icon name="chevron" />
            </div>
          </label>
          <div className="field-row">
            <Field
              label="Equipment class"
              value={equipment}
              onChange={setEquipment}
              placeholder="Select class…"
            />
            <Field
              label="Subsystem"
              value={subsystem}
              onChange={setSubsystem}
              placeholder="Select subsystem…"
            />
          </div>
          <div className="search-actions">
            <button
              type="button"
              className="button-primary"
              disabled={!query.trim()}
              onClick={() => setSearched(true)}
            >
              <Icon name="search" /> Search
            </button>
            <button
              type="button"
              className="button-light"
              onClick={() => {
                setQuery('');
                setAsset('');
                setEquipment('');
                setSubsystem('');
                setSearched(false);
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
            <span>Case library</span>
          </div>
          {searched ? (
            <div className="empty-state compact">
              <span className="empty-icon">
                <Icon name="database" />
              </span>
              <h3>Case search simulated</h3>
              <p>Your search criteria are logged. Query: "{query}". Similar cases will appear when the backend index is connected.</p>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="search" />
              </span>
              <h3>Search for cases</h3>
              <p>Enter a symptom or issue and optionally add asset context and filters, then Search to find similar cases.</p>
            </div>
          )}
          <div className="result-columns">
            <span>
              <Icon name="file" /> Case summary
            </span>
            <span>
              <Icon name="shield" /> Verification status
            </span>
            <span>
              <Icon name="layers" /> Similarity
            </span>
            <span>
              <Icon name="book" /> Sources
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function ProfilePage({ online }: { online: boolean }) {
  return (
    <>
      <PageIntro
        title="Technician profile"
        description="View technician details and connection status."
      />
      <section className="panel profile-card">
        <div className="profile-main">
          <div className="profile-avatar">T</div>
          <div>
            <h2>Technician account</h2>
            <p>
              <Icon name="gear" /> Technician details are supplied by the sign-in service.
            </p>
            <span className={online ? 'profile-online' : 'profile-offline'}>
              <i />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          <span className="signed-in">
            <Icon name="info" /> Profile active
          </span>
        </div>
        <div className="contact-section">
          <div className="contact-title">
            <Icon name="user" />
            <div>
              <h3>Contact details</h3>
              <p>Technician contact information.</p>
            </div>
          </div>
          <div className="contact-row">
            <Icon name="mail" />
            <strong>Email</strong>
            <span>technician@example.com</span>
          </div>
          <div className="contact-row">
            <Icon name="phone" />
            <strong>Phone</strong>
            <span>+91 XXXXX XXXXX</span>
          </div>
        </div>
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
          <Link to="/" className="button-light">
            &larr; Back to Landing Page
          </Link>
          <Link to="/supervisor" className="button-primary">
            Go to Supervisor Portal &rarr;
          </Link>
        </div>
      </section>
    </>
  );
}

export const TechnicianPage: React.FC = () => {
  const online = useNetworkStatus();
  const [page, setPage] = useState<Page>('capture');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState('');

  const recover = async () => {
    try {
      const saved = await getDrafts();
      setDrafts(saved);
      setStorageReady(true);
      setNotice('Offline drafts recovered from this device.');
      setTimeout(() => setNotice(''), 2500);
    } catch {
      setNotice('Local draft storage is unavailable in this browser.');
      setStorageReady(true);
    }
  };

  useEffect(() => {
    let active = true;
    getDrafts()
      .then((saved) => {
        if (active) setDrafts(saved);
      })
      .catch(() => {
        if (active) setNotice('Local draft storage is unavailable in this browser.');
      })
      .finally(() => {
        if (active) setStorageReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (draft: Draft) => {
    await saveDraft(draft);
    setDrafts((current) => [draft, ...current]);
  };

  const remove = async (id: string) => {
    await deleteDraft(id);
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

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
        draftsCount={drafts.length}
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

        {page === 'capture' && <CapturePage onSave={save} />}
        {page === 'drafts' && (
          <DraftsPage
            drafts={drafts}
            onRemove={(id) => void remove(id)}
            onRecover={() => void recover()}
            onNavigateToCapture={() => setPage('capture')}
          />
        )}
        {page === 'search' && <SearchPage />}
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
                : item === 'drafts' && drafts.length > 0
                  ? `Drafts (${drafts.length})`
                  : item[0].toUpperCase() + item.slice(1)}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default TechnicianPage;
