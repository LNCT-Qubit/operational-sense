import { NavLink } from 'react-router'
import { Icon } from './Icons'
import { navLinks } from './nav'

export default function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Supervisor navigation">
      {navLinks.map(({ to, short, icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={icon} />
          <span>{short}</span>
        </NavLink>
      ))}
    </nav>
  )
}
