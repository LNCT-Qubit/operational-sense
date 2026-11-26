
import { Icon } from './Icons';

interface TechnicianProfileProps {
  isOnline: boolean;
}

const technician = {
  name: 'Technician Name',
  role: 'Technician',
  email: 'technician@example.com',
  phone: '+91 XXXXX XXXXX',
};

export function TechnicianProfile({ isOnline }: TechnicianProfileProps) {
  return (
    <section className="profile-page">
      <div className="profile-heading">
        <h2>Technician Profile</h2>
        <p>View your personal and contact information.</p>
      </div>

      <div className="profile-card">
        <div className="profile-avatar">
          <Icon name="user" />
        </div>

        <div className="profile-identity">
          <h3>{technician.name}</h3>
          <p className="profile-role">{technician.role}</p>

          <div className="profile-status">
            <span
              className={`status-indicator ${isOnline ? 'online' : 'offline'}`}
            />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      <div className="contact-card">
        <div className="contact-heading">
          <h3>Contact Details</h3>
          <p>Your registered contact information.</p>
        </div>

        <div className="contact-item">
          <div className="contact-icon">
            <Icon name="mail" />
          </div>

          <div className="contact-info">
            <span>Email Address</span>
            <p>{technician.email}</p>
          </div>
        </div>

        <div className="contact-divider" />

        <div className="contact-item">
          <div className="contact-icon">
            <Icon name="phone" />
          </div>

          <div className="contact-info">
            <span>Phone Number</span>
            <p>{technician.phone}</p>
          </div>
        </div>
      </div>

      <footer className="profile-footer">
        <span>Operational Sense</span>
        <span>Technician Workspace</span>
      </footer>
    </section>
  );
}
