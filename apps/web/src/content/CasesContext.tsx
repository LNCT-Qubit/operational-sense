import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import {
  DraftApiError,
  decideServerDraft,
  listServerDrafts,
  upsertDraftRequest,
  type ServerDraftDetail,
} from '../api/drafts'
import { getAccessToken } from '../api/session'
import type { Case, Decision, Draft, Status } from '../types'

interface CasesState {
  cases: Case[]
  loading: boolean
  message: string
  flash: (text: string) => void
  refreshCases: () => Promise<void>
  decide: (id: string, status: Decision, comment?: string) => Promise<boolean>
  createDecided: (draft: Draft, status: Decision) => Promise<string | null>
}

const CasesContext = createContext<CasesState>(null!)
// eslint-disable-next-line react-refresh/only-export-components
export const useCases = () => useContext(CasesContext)

function mapServerStatus(status: ServerDraftDetail['status']): Status {
  if (status === 'APPROVED') return 'Approved'
  if (status === 'REJECTED') return 'Rejected'
  return 'Pending'
}

function mapServerDraftToCase(d: ServerDraftDetail): Case {
  const issue = d.symptom || d.observation || d.transcription?.transcript || '(No symptom/observation text)'
  return {
    id: d.id,
    equipment: d.equipment || 'Field Capture',
    issue,
    by: d.created_by,
    status: mapServerStatus(d.status),
    mode: d.capture_mode,
    subsystem: d.subsystem,
    observation: d.observation,
    probableCause: d.probable_cause,
    actionTaken: d.action_taken,
    partsUsed: d.parts_used,
    safetyNotes: d.safety_notes,
    reviewComment: d.review_comment,
    createdAt: d.created_at,
    recordingId: d.recording_id,
    transcriptionText: d.transcription?.transcript ?? null,
    attachmentsCount: d.attachments.length,
  }
}

export function CasesProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const { pathname } = useLocation()

  const flash = useCallback((text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 2800)
  }, [])

  const refreshCases = useCallback(async () => {
    if (!getAccessToken() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return
    }
    setLoading(true)
    try {
      const res = await listServerDrafts({ limit: 100, offset: 0 })
      setCases(res.items.map(mapServerDraftToCase))
    } catch (err) {
      if (err instanceof DraftApiError && err.status !== 401) {
        flash(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [flash])

  useEffect(() => {
    let active = true
    const isSupervisorRoute =
      pathname.startsWith('/supervisor') || pathname.startsWith('/queue') || pathname.startsWith('/decide')
    if (isSupervisorRoute && getAccessToken()) {
      void Promise.resolve().then(() => {
        if (active) {
          return refreshCases()
        }
      })
    } else if (!getAccessToken()) {
      void Promise.resolve().then(() => {
        if (active) {
          setCases([])
        }
      })
    }
    return () => {
      active = false
    }
  }, [pathname, refreshCases])

  const decide = useCallback(
    async (id: string, status: Decision, comment?: string): Promise<boolean> => {
      try {
        const res = await decideServerDraft(id, status === 'Approved' ? 'APPROVED' : 'REJECTED', comment ?? null)
        if (res.conflict) {
          flash(res.errorMessage ?? 'This case was already decided by another supervisor. Refreshing queue…')
          await refreshCases()
          return false
        }
        if (res.draft) {
          const updated = mapServerDraftToCase(res.draft)
          setCases((list) => list.map((c) => (c.id === id ? updated : c)))
        }
        flash(`${id.slice(0, 8)} ${status.toLowerCase()}`)
        return true
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not submit decision.')
        return false
      }
    },
    [flash, refreshCases],
  )

  const createDecided = useCallback(
    async (draft: Draft, status: Decision): Promise<string | null> => {
      if (!draft.equipment || !draft.issue) return 'Fill Equipment and Issue first'
      try {
        const clientDraftId = crypto.randomUUID()
        const upsert = await upsertDraftRequest({
          clientDraftId,
          captureMode: 'text',
          equipment: draft.equipment,
          subsystem: draft.subsystem ?? '',
          symptom: draft.issue,
          observation: draft.observation ?? draft.issue,
          probableCause: draft.probableCause ?? '',
          actionTaken: draft.actionTaken ?? '',
          partsUsed: draft.partsUsed ?? '',
          safetyNotes: draft.safetyNotes ?? '',
          status: 'PENDING_REVIEW',
        })
        if (!upsert.ok || !upsert.data?.draft?.id) {
          return upsert.errorMessage ?? 'Could not create case on server.'
        }
        const serverId = upsert.data.draft.id
        const decisionRes = await decideServerDraft(serverId, status === 'Approved' ? 'APPROVED' : 'REJECTED')
        if (decisionRes.conflict) {
          await refreshCases()
          return decisionRes.errorMessage ?? 'Case was already decided.'
        }
        if (decisionRes.draft) {
          const createdCase = mapServerDraftToCase(decisionRes.draft)
          setCases((list) => [createdCase, ...list.filter((c) => c.id !== createdCase.id)])
        }
        flash(`${serverId.slice(0, 8)} ${status.toLowerCase()}`)
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not create and decide case.'
      }
    },
    [flash, refreshCases],
  )

  return (
    <CasesContext.Provider value={{ cases, loading, message, flash, refreshCases, decide, createDecided }}>
      {children}
    </CasesContext.Provider>
  )
}
