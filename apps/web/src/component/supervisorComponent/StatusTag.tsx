import type { Status } from '../../types'

export default function StatusTag({ status, className = '' }: { status: Status; className?: string }) {
  return <span className={`status-tag ${status.toLowerCase()} ${className}`}>{status}</span>
}
