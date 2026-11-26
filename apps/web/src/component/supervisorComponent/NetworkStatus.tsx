import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { Icon } from './Icons'

export default function NetworkStatus() {
  const online = useNetworkStatus()
  return (
    <span className={`network-status ${online ? 'online' : 'offline'}`} role="status" aria-live="polite">
      <Icon name="wifi" />
      <i />
      {online ? 'Network online' : 'Offline mode'}
    </span>
  )
}
