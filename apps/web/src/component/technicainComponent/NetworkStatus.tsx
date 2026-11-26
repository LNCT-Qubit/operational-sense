import { Icon } from './Icons';
export function NetworkStatus({ isOnline }: { isOnline: boolean }) {
  return <span className={`network-status ${isOnline ? 'online' : 'offline'}`} role="status" aria-live="polite"><span className="status-dot"/>{isOnline ? 'Online' : 'Offline'}<span className="network-icon"><Icon name="wifi"/></span></span>;
}
