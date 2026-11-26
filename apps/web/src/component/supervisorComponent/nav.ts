import type { IconName } from './Icons'

export const navLinks: { to: string; label: string; short: string; icon: IconName; end?: boolean }[] = [
  { to: '/supervisor', label: 'Dashboard', short: 'Dashboard', icon: 'grid', end: true },
  { to: '/supervisor/queue', label: 'Review Queue', short: 'Queue', icon: 'list' },
  { to: '/supervisor/decide', label: 'Approve / Reject', short: 'Decide', icon: 'shield' },
  { to: '/supervisor/profile', label: 'Profile', short: 'Profile', icon: 'user' },
]
