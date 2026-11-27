import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import EmptyState from '../../component/supervisorComponent/EmptyState'
import { Icon } from '../../component/supervisorComponent/Icons'
import PageIntro from '../../component/supervisorComponent/PageIntro'
import Panel from '../../component/supervisorComponent/Panel'
import { useCases } from '../../content/CasesContext'
import type { Decision, Draft } from '../../types'

const FIELDS: [keyof Draft, string][] = [
  ['id', 'Case ID'],
  ['equipment', 'Equipment'],
  ['issue', 'Issue'],
  ['by', 'Submitted by'],
]

export default function ApproveReject() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { cases, decide, createDecided, flash } = useCases()
  const [draft, setDraft] = useState<Draft>({ id: '', equipment: '', issue: '', by: '' })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const current = cases.find((c) => c.id === id)
  const data = current ?? draft
  const locked = !!current && current.status !== 'Pending'

  const submit = async (status: Decision) => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (current) {
        const ok = await decide(current.id, status, comment.trim() || undefined)
        if (ok) navigate('/supervisor/queue')
      } else {
        const error = await createDecided(draft, status)
        if (error) {
          flash(error)
          return
        }
        navigate('/supervisor/queue')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageIntro title="Approve / reject" description="Review the case details, then approve or reject." />
      <div className="split-layout layout-decide">
        <Panel title="Select case" subtitle="Choose a case from the queue to review.">
          <label className="field">
            <span>Case</span>
            <select
              value={id ?? ''}
              onChange={(e) => navigate(e.target.value ? `/supervisor/decide/${e.target.value}` : '/supervisor/decide')}
            >
              <option value="">New case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id.slice(0, 8)} · {c.equipment} ({c.status})
                </option>
              ))}
            </select>
          </label>

          <div className="decide-summary">
            <EmptyState
              title={current?.equipment ?? 'No case selected'}
              text={current ? `${current.equipment}: ${current.issue}` : 'Pick a case from the Review Queue to approve or reject it.'}
            />
            <Link to="/supervisor/queue" className="button-light">
              <Icon name="list" /> Open Review Queue
            </Link>
          </div>
        </Panel>

        <Panel
          title="Approve / Reject"
          subtitle="Review the case details, then approve or reject."
          badge={<span className={`review-badge ${current ? current.status.toLowerCase() : ''}`}>{current?.status ?? 'New case'}</span>}
        >
          <div className="review-fields">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="field">
                <span>{label}</span>
                <input
                  value={String(data[key] ?? '')}
                  readOnly={!!current || key === 'id'}
                  placeholder={key === 'id' && !current ? 'Generated automatically on submit' : undefined}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}

            {current?.observation && (
              <label className="field">
                <span>Observation</span>
                <textarea value={current.observation} readOnly />
              </label>
            )}
            {current?.transcriptionText && (
              <label className="field">
                <span>Transcript</span>
                <textarea value={current.transcriptionText} readOnly />
              </label>
            )}
            {current && (
              <label className="field">
                <span>Review comment (optional)</span>
                <input
                  value={locked ? (current.reviewComment ?? '') : comment}
                  readOnly={locked}
                  placeholder="Add verification note or rejection reason…"
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="review-actions">
            <button type="button" className="button-danger" disabled={locked || submitting} onClick={() => void submit('Rejected')}>
              <Icon name="close" /> Reject
            </button>
            <button type="button" className="button-primary" disabled={locked || submitting} onClick={() => void submit('Approved')}>
              <Icon name="check" /> Approve
            </button>
          </div>
          <div className="review-note">
            <Icon name="shield" />
            <span>{locked ? 'This case has already been decided and is locked.' : 'Decisions are final once a case is approved or rejected.'}</span>
          </div>
        </Panel>
      </div>
    </>
  )
}
