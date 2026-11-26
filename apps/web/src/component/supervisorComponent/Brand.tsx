import { Icon } from './Icons'

export default function Brand() {
  return (
    <div className="brand-lockup">
      <span className="brand-symbol"><Icon name="gear" /></span>
      <span className="brand-words">
        <strong>Workshop Note</strong>
        <small>Supervisor workspace</small>
      </span>
    </div>
  )
}
