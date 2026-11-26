import { Icon } from './Icons';

type Page = 'capture' | 'history' | 'profile';

export function MobileNavigation({ active, onNavigate }: { active: Page; onNavigate: (page: Page) => void }) {
  return (
    <nav className="mobile-navigation" aria-label="Mobile navigation">
      <button
        className={active === 'capture' ? 'active' : ''}
        onClick={() => onNavigate('capture')}
      >
        <Icon name="mic" />
        <span>Capture</span>
      </button>

      <button
        className={active === 'profile' ? 'active' : ''}
        onClick={() => onNavigate('profile')}
      >
        <Icon name="user" />
        <span>Profile</span>
      </button>
    </nav>
  );
}
