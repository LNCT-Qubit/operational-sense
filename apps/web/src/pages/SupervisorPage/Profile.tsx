import { getCurrentUser } from '../../api/session'
import { Icon } from '../../component/supervisorComponent/Icons'
import PageIntro from '../../component/supervisorComponent/PageIntro'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export default function Profile() {
  const online = useNetworkStatus()
  const user = getCurrentUser()
  const initial = (user?.name?.[0] ?? 'S').toUpperCase()

  return (
    <>
      <PageIntro
        title="Supervisor profile"
        description="View supervisor details and connection status."
      />

      <section className="panel profile-card">
        <div className="profile-main">
          <div className="profile-avatar">{initial}</div>

          <div>
            <h2>{user?.name ?? 'Supervisor account'}</h2>
            <p>Role: {user?.role ?? 'SUPERVISOR'}</p>

            <span className={online ? 'profile-online' : 'profile-offline'}>
              <i />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>

          <span className="signed-in">
            <Icon name="info" /> {user ? 'Signed in' : 'Session unavailable'}
          </span>
        </div>

        <div className="contact-section">
          <div className="contact-title">
            <Icon name="user" />
            <div>
              <h3>Account details</h3>
              <p>Authenticated supervisor information from the sign-in service.</p>
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
  )
}
