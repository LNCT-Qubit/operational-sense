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

  const current = cases.find(c => c.id === id)
  const data = current ?? draft
  const locked = !!current && current.status !== 'Pending'

  const submit = (status: Decision) => {
    if (current) {
      decide(current.id, status)
    } else {
      const error = createDecided(draft, status)
      if (error) return flash(error)
    }
    navigate('/supervisor/queue')
  }

  return (
    <>
      <PageIntro title="Approve / reject" description="Review the case details, then approve or reject." />
      <div className="split-layout layout-decide">
        <Panel title="Select case" subtitle="Choose a case from the queue to review.">
          <label className="field">
            <span>Case</span>
            <select value={id ?? ''} onChange={e => navigate(e.target.value ? `/supervisor/decide/${e.target.value}` : '/supervisor/decide')}>
              <option value="">New case</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>{c.id} · {c.equipment} ({c.status})</option>
              ))}
            </select>
          </label>
          
          <div className="decide-summary">
            <EmptyState
              title={current?.id ?? 'No case selected'}
              text={current ? `${current.equipment}: ${current.issue}` : 'Pick a case from the Review Queue to approve or reject it.'}
            />
            <Link to="/supervisor/queue" className="button-light"><Icon name="list" /> Open Review Queue</Link>
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
                  value={data[key]}
                  readOnly={!!current}
                  onChange={e => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="review-actions">
            <button className="button-danger" disabled={locked} onClick={() => submit('Rejected')}>
              <Icon name="close" /> Reject
            </button>
            <button className="button-primary" disabled={locked} onClick={() => submit('Approved')}>
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
