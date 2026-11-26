export type Status = 'Pending' | 'Approved' | 'Rejected'
export type Decision = Exclude<Status, 'Pending'>

export interface Case {
  id: string
  equipment: string
  issue: string
  by: string
  status: Status
}

export type Draft = Omit<Case, 'status'>
