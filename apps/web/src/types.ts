export type Status = 'Pending' | 'Approved' | 'Rejected'
export type Decision = Exclude<Status, 'Pending'>

export interface Case {
  id: string
  equipment: string
  issue: string
  by: string
  status: Status
  mode?: 'voice' | 'text'
  subsystem?: string
  observation?: string
  probableCause?: string
  actionTaken?: string
  partsUsed?: string
  safetyNotes?: string
  reviewComment?: string | null
  createdAt?: string
  recordingId?: string | null
  transcriptionText?: string | null
  attachmentsCount?: number
}

export type Draft = Omit<Case, 'status'>
