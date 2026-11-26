import { Brand } from './Brand';
import { Icon } from './Icons';

type Page = 'capture' | 'history' | 'profile';

export function Sidebar({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  return (
    <aside className="sidebar">
      <Brand />

      <p className="sidebar-label">WORKSPACE</p>

      <nav aria-label="Main navigation">
        <button
          className={active === 'capture' ? 'nav-link active' : 'nav-link'}
          onClick={() => onNavigate('capture')}
        >
          <Icon name="mic" />
          Capture
        </button>

        <button
          className={active === 'profile' ? 'nav-link active' : 'nav-link'}
          onClick={() => onNavigate('profile')}
        >
          <Icon name="user" />
          Profile
        </button>
      </nav>

      <div className="sidebar-bottom">
        <span className="sidebar-avatar">T</span>
        <span>
          <strong>Technician workspace</strong>
          <small>Field observation capture</small>
        </span>
      </div>
    </aside>
  );
}
