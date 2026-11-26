import type { ReactNode } from 'react';
export function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return <div className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-copy"><span className="metric-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</span></div>;
}
