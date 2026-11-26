import { Link } from 'react-router'
import EmptyState from '../../component/supervisorComponent/EmptyState'
import { Icon, type IconName } from '../../component/supervisorComponent/Icons'
import PageIntro from '../../component/supervisorComponent/PageIntro'
import Panel from '../../component/supervisorComponent/Panel'
import StatusTag from '../../component/supervisorComponent/StatusTag'
import { useCases } from '../../content/CasesContext'

export default function Dashboard() {
  const { cases } = useCases()
  const count = (s: string) => cases.filter(c => c.status === s).length

  const stats: { label: string; n: number; icon: IconName }[] = [
    { label: 'Total Cases', n: cases.length, icon: 'file' },
    { label: 'Pending Review', n: count('Pending'), icon: 'clock' },
    { label: 'Approved', n: count('Approved'), icon: 'check' },
    { label: 'Rejected', n: count('Rejected'), icon: 'close' },
  ]

  return (
    <>
      <PageIntro title="Supervisor dashboard" description="Track cases submitted by technicians and act on pending reviews." />
      <div className="split-layout">
        <Panel eyebrow="OVERVIEW" title="Case overview" subtitle="Cases submitted by technicians and their review status.">
          <div className="stat-grid">
            {stats.map(({ label, n, icon }) => (
              <div key={label} className="stat-card">
                <span className="draft-icon"><Icon name={icon} /></span>
                <div>
                  <b>{n}</b>
                  <span>{label}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="panel-actions">
            <Link to="/supervisor/queue" className="button-light"><Icon name="list" /> Review Queue</Link>
            <Link to="/supervisor/decide" className="button-primary"><Icon name="shield" /> Approve / Reject</Link>
          </div>
        </Panel>

        <Panel title="Recent activity" subtitle="Latest submissions and decisions appear here.">
          {cases.length ? (
            <div className="draft-list">
              {[...cases].reverse().slice(0, 5).map(c => (
                <Link key={c.id} to={`/supervisor/decide/${c.id}`} className="draft-item">
                  <span className="draft-icon"><Icon name="file" /></span>
                  <div className="draft-copy">
                    <strong>{c.id} · {c.equipment}</strong>
                    <p>{c.issue}</p>
                    <small>Submitted by {c.by || '—'}</small>
                  </div>
                  <StatusTag status={c.status} />
                </Link>
              ))}
            </div>
          ) : (
            <>
              <div className="review-note">
                <Icon name="info" />
                <span>No cases yet. New cases submitted by technicians will appear here.</span>
              </div>
              <EmptyState title="No recent activity" text="Decisions you make and new cases from technicians will be listed here." />
            </>
          )}
        </Panel>
      </div>
    </>
  )
}
