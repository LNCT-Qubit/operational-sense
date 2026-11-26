import type { ReactNode } from 'react'

interface Props {
  title: string
  eyebrow?: string
  subtitle?: string
  badge?: ReactNode
  className?: string
  children: ReactNode
}

export default function Panel({ title, eyebrow, subtitle, badge, className = '', children }: Props) {
  return (
    <section className={`panel ${className}`}>
      <div className="section-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}
