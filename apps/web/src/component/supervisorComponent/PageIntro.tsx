export default function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">WORKSHOP NOTE / SUPERVISOR</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  )
}
