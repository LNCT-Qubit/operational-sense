import { useState } from 'react'
import { Link } from 'react-router'
import EmptyState from '../../component/supervisorComponent/EmptyState'
import { Icon } from '../../component/supervisorComponent/Icons'
import PageIntro from '../../component/supervisorComponent/PageIntro'
import Panel from '../../component/supervisorComponent/Panel'
import StatusTag from '../../component/supervisorComponent/StatusTag'
import { useCases } from '../../content/CasesContext'

export default function ReviewQueue() {
  const { cases } = useCases()
  const [search, setSearch] = useState('')

  const shown = cases.filter(
    c =>
      [c.id, c.equipment, c.issue, c.by].join(' ').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <>
      <PageIntro title="Supervisor review queue" description="Find and open cases submitted by technicians." />
      <div className="split-layout layout-queue">
        <Panel eyebrow="SEARCH" title="Review queue" subtitle="Find and open cases submitted by technicians." className="compact">
          <div className="stack-fields">
            <label className="field">
              <span>Search</span>
              <div className="input-icon">
                <Icon name="search" />
                <input placeholder="Search cases…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </label>
          </div>
        </Panel>

        <Panel
          eyebrow="CASES"
          title="Supervisor review queue"
          subtitle="Open a submitted case, review the details, then approve or reject."
        >
          {shown.length ? (
            <>
              <div className="queue-head">
                <span>Case ID</span><span>Equipment</span><span>Issue</span><span>Submitted By</span><span>Action</span>
              </div>
              <div className="queue-list">
                {shown.map(c => (
                  <div key={c.id} className="queue-row">
                    <b className="q-id">{c.id}</b>
                    <StatusTag status={c.status} className="q-status" />
                    <span className="q-equipment">{c.equipment}</span>
                    <span className="q-issue">{c.issue}</span>
                    <span className="q-by" data-label="Submitted by">{c.by || '—'}</span>
                    <div className={c.status === 'Pending' ? 'q-action' : 'q-action status-only'}>
                      {c.status === 'Pending'
                        ? <Link to={`/supervisor/decide/${c.id}`} className="button-primary">Review</Link>
                        : <StatusTag status={c.status} />}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title={cases.length ? 'No matching cases' : 'No cases yet'}
              text={cases.length ? 'Try a different search.' : 'New cases submitted by technicians will appear here, ready for you to review.'}
            />
          )}
        </Panel>
      </div>
    </>
  )
}
