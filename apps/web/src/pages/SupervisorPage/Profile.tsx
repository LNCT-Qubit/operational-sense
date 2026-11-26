
import { Icon } from '../../component/supervisorComponent/Icons'
import PageIntro from '../../component/supervisorComponent/PageIntro'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export default function Profile() {
  const online = useNetworkStatus()

  return (
    <>
      <PageIntro
        title="Supervisor profile"
        description="View supervisor details and connection status."
      />

      <section className="panel profile-card">
        <div className="profile-main">
          <div className="profile-avatar">S</div>

          <div>
            <h2>Supervisor account</h2>

            <span className={online ? 'profile-online' : 'profile-offline'}>
              <i />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>

          <span className="signed-in">
            <Icon name="info" /> Profile integration pending
          </span>
        </div>

        <div className="contact-section">
          <div className="contact-title">
            <Icon name="user" />
            <div>
              <h3>Contact details</h3>
              <p>Supervisor contact information.</p>
            </div>
          </div>

          <div className="contact-row">
            <Icon name="mail" />
            <strong>Email</strong>
            <span>Not provided</span>
          </div>

          <div className="contact-row">
            <Icon name="phone" />
            <strong>Phone</strong>
            <span>Not provided</span>
          </div>
        </div>
      </section>
    </>
  )
}
