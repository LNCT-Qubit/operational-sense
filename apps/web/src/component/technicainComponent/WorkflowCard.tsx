const steps = [
  ['Record observation', 'Capture a short voice note from the field (up to 30 seconds).'],
  ['Save on device', 'Keep a local copy on this device, even when offline.'],
  ['Synchronize', 'Automatically upload when a connection is available.'],
  ['Transcribe and structure', 'Convert audio to text and organize the key information.'],
  ['Human review', 'Reviewed by a subject matter expert before it is added to the knowledge base.'],
];
export function WorkflowCard() {
  return <section className="workflow-card"><div className="panel-heading"><h2>Workflow: from field to knowledge</h2><p>What happens after you capture an observation</p></div><ol className="workflow-list">{steps.map(([title, description], index) => <li key={title}><span className={`step-number ${index === 0 ? 'current' : ''}`}>{index + 1}</span><div><strong>{title}</strong><p>{description}</p></div></li>)}</ol></section>;
}
