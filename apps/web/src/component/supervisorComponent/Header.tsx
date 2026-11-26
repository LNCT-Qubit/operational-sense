import { Link, NavLink, useNavigate } from 'react-router'
import { clearSession, getCurrentUser } from '../../api/session'
import Brand from './Brand'
import { Icon } from './Icons'
import NetworkStatus from './NetworkStatus'
import { navLinks } from './nav'

export default function Header() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const logout = () => { clearSession(); navigate('/', { replace: true }) }
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} title="Back to Landing Page">
          <Brand />
        </Link>
      </div>
      <nav className="desktop-nav" aria-label="Main navigation">
        {navLinks.map(({ to, label, short, icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'top-link active' : 'top-link')}>
            <Icon name={icon} />
            <span className="label-full">{label}</span>
            <span className="label-short">{short}</span>
          </NavLink>
        ))}
      </nav>
      <div className="topbar-status">
        <NetworkStatus />
        {user && <button type="button" className="top-link" onClick={logout} aria-label="Log out">Log out</button>}

        {/* <Link to="/" className="top-link exit-btn" style={{ marginLeft: '10px' }} title="Return to Landing Page">
          <Icon name="close" />
          <span className="label-full">Exit</span>
          <span className="label-short">Exit</span>
        </Link> */}
      </div>
      <span className="sync-state">
        <Icon name="refresh" /> Sync idle
      </span>
    </header>
  )
}
