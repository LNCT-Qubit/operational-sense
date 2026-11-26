import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Case, Decision, Draft } from '../types'

interface CasesState {
  cases: Case[]
  message: string
  flash: (text: string) => void
  decide: (id: string, status: Decision) => void
  createDecided: (draft: Draft, status: Decision) => string | null
}

const CasesContext = createContext<CasesState>(null!)
// eslint-disable-next-line react-refresh/only-export-components
export const useCases = () => useContext(CasesContext)

export function CasesProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<Case[]>(() => JSON.parse(localStorage.getItem('cases') ?? '[]'))
  const [message, setMessage] = useState('')

  useEffect(() => localStorage.setItem('cases', JSON.stringify(cases)), [cases])

  const flash = (text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 2200)
  }

  const decide = (id: string, status: Decision) => {
    setCases(list => list.map(c => (c.id === id ? { ...c, status } : c)))
    flash(`${id} ${status.toLowerCase()}`)
  }

  const createDecided = (draft: Draft, status: Decision) => {
    if (!draft.id || !draft.equipment || !draft.issue) return 'Fill Case ID, Equipment and Issue first'
    if (cases.some(c => c.id.toLowerCase() === draft.id.toLowerCase())) return 'This Case ID already exists'
    setCases([...cases, { ...draft, status }])
    flash(`${draft.id} ${status.toLowerCase()}`)
    return null
  }

  return (
    <CasesContext.Provider value={{ cases, message, flash, decide, createDecided }}>
      {children}
    </CasesContext.Provider>
  )
}
