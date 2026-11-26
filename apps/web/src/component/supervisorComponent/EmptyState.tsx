import { Icon } from './Icons'

export default function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="search" /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}
