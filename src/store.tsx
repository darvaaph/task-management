import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DocumentData, FieldValue, QueryDocumentSnapshot, UpdateData, WriteBatch } from 'firebase/firestore'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS, FREE_MEMBER_QUOTA, FREE_PROJECT_QUOTA, MEMBER_POOL, PEOPLE, PRO_MEMBER_QUOTA, STATUS } from './lib/constants'
import { addDays, diffDays, fmtDay, today } from './lib/dates'
import { inToday, isOverdue, nextActiveOccurrence, parseDest, type Dest } from './lib/logic'
import { guideTasks, seed } from './lib/seed'
import { feedback } from './lib/feedback'
import type { Activity, Area, Data, ISODate, Priority, Project, Recurrence, Status, Task } from './lib/types'

type FirebaseMod = typeof import('./lib/firebase')

let fbPromise: Promise<FirebaseMod> | null = null
const loadFirebase = (): Promise<FirebaseMod> => (fbPromise ??= import('./lib/firebase'))

const REDIRECT_FLAG = 'taskflow-auth-redirect'
const hasRedirectFlag = () => {
  try { return sessionStorage.getItem(REDIRECT_FLAG) === '1' } catch { return false }
}
const setRedirectFlag = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(REDIRECT_FLAG, '1')
    else sessionStorage.removeItem(REDIRECT_FLAG)
  } catch { /* ignore private mode */ }
}

const KEY = 'taskflow-v1'

export type View = 'today' | 'inbox' | 'jadwal' | 'projects' | 'project'
export type Theme = 'light' | 'dark'
export type Accent = 'indigo' | 'teal' | 'tangerine' | 'forest'
/** Which locked feature opened the Pro screen; highlights its row and explains it. */
export type ProCtx = 'general' | 'tl' | 'rec' | 'dur' | 'proj' | 'accent' | 'rem' | 'share'

export interface Account {
  loggedIn: boolean
  /** Demo mode opens every Pro feature, labelled DEMO PREVIEW. */
  demo: boolean
  /** Signed-in Firebase UID, used to isolate Phase-1 local project data per user on reload. */
  uid?: string
  name: string
  plan: 'free' | 'pro'
  accent: Accent
  /** New accounts show a welcome card until skipped. */
  onboarding: boolean
  checkedAreas: boolean
  /** Soft tick when a task is completed. Off by default. */
  sound?: boolean
  /** Short vibration on completion and swipe threshold (Android only on the web). Off by default. */
  haptics?: boolean
  /** Reminders already shown, as "task:due:key", so a reload never shows one twice. */
  notified?: string[]
}

export interface LocalMigration {
  areas: Area[]
  tasks: Task[]
}

const ACCOUNT0: Account = { loggedIn: false, demo: false, name: 'Anda', plan: 'free', accent: 'indigo', onboarding: false, checkedAreas: false }
const EMPTY_DATA: Data = { tasks: [], projects: [], areas: [], activity: [] }
const BATCH_LIMIT = 500
const TEXT_DEBOUNCE_MS = 600

interface PendingTaskWrite {
  kind: 'task'
  uid: string
  id: string
  patch: Partial<Task>
  timer: number
}

interface PendingAreaWrite {
  kind: 'area'
  uid: string
  id: string
  patch: Partial<Area>
  timer: number
}

type PendingWrite = PendingTaskWrite | PendingAreaWrite

const safeDocId = (raw: string, fallback: string) =>
  raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || fallback

interface StoredState {
  data?: Data
  byUid?: Record<string, Data>
  theme?: Theme
  account?: Partial<Account>
  seeded?: boolean
  migrated?: boolean
  /** Unmigrated pre-cloud local data, stashed when "Coba Mode Demo" replaced the root slot with sample data. */
  legacy?: Data
}

/** Heuristic for pre-1E browsers that stored untouched seed() data before loggedIn was ever true. */
function isUntouchedSeed(saved: StoredState): boolean {
  if (saved.seeded === true) return true
  if (saved.account?.loggedIn) return false
  const tasks = saved.data?.tasks ?? []
  const projects = saved.data?.projects ?? []
  return (
    tasks.length === 20
    && tasks.some(t => t.id === 't1' && t.title === 'Kirim revisi bab 2')
    && projects.some(p => p.id === 'uas' && p.name === 'Tugas Akhir UAS')
  )
}

function normalizeData(d?: Partial<Data>): Data {
  return {
    tasks: Array.isArray(d?.tasks) ? d.tasks : [],
    projects: Array.isArray(d?.projects) ? d.projects : [],
    areas: Array.isArray(d?.areas) ? d.areas : [],
    activity: Array.isArray(d?.activity) ? d.activity : [],
  }
}

function extractMigration(saved: StoredState): LocalMigration | null {
  if (!saved || saved.migrated === true) return null
  // A stashed copy always wins: the root slot holds demo data once the stash exists.
  const stashed = Boolean(saved.legacy)
  const src = stashed ? saved.legacy : saved.data
  if (!src) return null
  // Root `saved.data` holds pre-backend local data (separate from per-account `byUid`),
  // so returning Google users also receive the migration offer until migrated or skipped.
  if (!stashed && (saved.account?.demo === true || isUntouchedSeed(saved))) return null
  // Legacy 1D/1E storage stored a signed-in user's cleared local data directly in `saved.data` without `byUid`.
  if (!stashed && !saved.byUid && saved.account?.uid) return null
  const areas = Array.isArray(src.areas)
    ? src.areas.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && a.name.trim())
    : []
  const tasks = Array.isArray(src.tasks)
    ? src.tasks.filter(t => t && typeof t.id === 'string' && !t.project && !t.guide && typeof t.title === 'string' && t.title.trim())
    : []
  if (!areas.length && !tasks.length) return null
  return { areas, tasks }
}

export interface UI {
  view: View
  projectId: string | null
  mode: 'list' | 'board' | 'timeline'
  taskId: string | null
  inboxArea: string
  projArea: string
  archives: boolean
  banner: boolean
  cal: 'month' | 'week' | 'timeline'
  /** Selected day, shared by Bulan and Minggu. */
  calDay: ISODate
  overlay: null | 'search' | 'project' | 'areas' | 'share'
  pro: ProCtx | null
}

interface Toast {
  msg: string
  undo: (() => void) | null
}

const UI0 = (): UI => ({ view: 'today', projectId: null, mode: 'list', taskId: null, inboxArea: 'all', projArea: 'all', archives: false, banner: true, cal: 'month', calDay: today(), overlay: null, pro: null })

function load(): {
  data: Data
  rootData: Data
  byUid: Record<string, Data>
  theme: Theme
  account: Account
  seeded: boolean
  migrated: boolean
  legacy: Data | null
  migration: LocalMigration | null
} {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as StoredState | null
    if (s?.data?.tasks) {
      const rootData = normalizeData(s.data)
      const account: Account = { ...ACCOUNT0, ...s.account }
      const byUid: Record<string, Data> = {}
      if (s.byUid && typeof s.byUid === 'object') {
        for (const [k, v] of Object.entries(s.byUid)) byUid[k] = normalizeData(v)
      } else if (account.uid && !account.demo) {
        // Lift pre-P1 single-slot local projects into this user's per-uid bucket.
        byUid[account.uid] = rootData
      }
      const activeData = account.loggedIn && !account.demo && account.uid
        ? (byUid[account.uid] ?? EMPTY_DATA)
        : rootData
      return {
        data: activeData,
        rootData,
        byUid,
        theme: s.theme === 'dark' ? 'dark' : 'light',
        account,
        seeded: isUntouchedSeed(s),
        migrated: s.migrated === true,
        legacy: s.legacy && s.migrated !== true ? normalizeData(s.legacy) : null,
        migration: extractMigration(s),
      }
    }
  } catch {
    /* storage unavailable or corrupt: start from demo data */
  }
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  const demoSeed = seed()
  return { data: demoSeed, rootData: demoSeed, byUid: {}, theme: dark ? 'dark' : 'light', account: ACCOUNT0, seeded: true, migrated: false, legacy: null, migration: null }
}

const pushActivity = (list: Activity[], p: string, text: string): Activity[] =>
  [{ p, text, ts: Date.now() }, ...list].slice(0, 200)

const statusActivity = (actor: string, title: string, status: Task['status']) =>
  status === 'done' ? `${actor} menyelesaikan "${title}"` : `${actor} memindah "${title}" ke ${STATUS[status]}`

const VALID_STATUS: Status[] = ['todo', 'in_progress', 'done']
const VALID_PRIO: Priority[] = ['high', 'med', 'low']
const VALID_REC: Recurrence[] = ['daily', 'weekly', 'weekdays', 'monthly']
const VALID_REMS = ['m10', 'm30', 'h1', 'd0', 'd1', 'd3']

const authErrMsg = (err: unknown) => {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Masuk dibatalkan.'
  if (code === 'auth/network-request-failed') return 'Tidak bisa terhubung ke Google. Periksa koneksi internet lalu coba lagi.'
  return 'Gagal masuk dengan Google. Coba lagi.'
}

function docToTask(snap: QueryDocumentSnapshot): { task: Task; createdAtMs: number | null } {
  const d = snap.data()
  const rawCreated = d.createdAt
  const createdAtMs = rawCreated && typeof rawCreated.toMillis === 'function' ? rawCreated.toMillis() : null
  const task: Task = {
    id: snap.id,
    title: typeof d.title === 'string' ? d.title : '',
    project: null,
    area: typeof d.area === 'string' ? d.area : null,
    section: typeof d.section === 'string' ? d.section : null,
    assignee: typeof d.assignee === 'string' ? d.assignee : null,
    status: VALID_STATUS.includes(d.status as Status) ? (d.status as Status) : 'todo',
    prio: VALID_PRIO.includes(d.prio as Priority) ? (d.prio as Priority) : 'med',
    start: typeof d.start === 'string' ? d.start : null,
    due: typeof d.due === 'string' ? d.due : null,
    time: typeof d.time === 'string' ? d.time : null,
    notes: typeof d.notes === 'string' ? d.notes : '',
    rec: VALID_REC.includes(d.rec as Recurrence) ? (d.rec as Recurrence) : null,
    dur: typeof d.dur === 'number' ? d.dur : null,
    ...(Array.isArray(d.rems) ? { rems: d.rems.filter((x): x is string => typeof x === 'string') } : {}),
    ...(d.guide === true ? { guide: true } : {}),
  }
  return { task, createdAtMs }
}

/** Build a Firestore-rules-compliant payload for creating/restoring a loose task document. */
function taskToCloudDoc(t: Task, ownerUid: string, pro: boolean, serverTs: () => FieldValue): Record<string, unknown> {
  const title = t.title.trim().slice(0, 300) || 'Tanpa judul'
  const dur = pro && typeof t.dur === 'number' && t.dur > 0 ? Math.min(1440, Math.round(t.dur)) : null
  const rec = t.rec && (pro || t.rec === 'daily' || t.rec === 'weekly') ? t.rec : null
  const payload: Record<string, unknown> = {
    title,
    project: null,
    area: t.area ?? null,
    section: null,
    assignee: null,
    status: t.status,
    prio: t.prio,
    start: t.start ?? null,
    due: t.due ?? null,
    time: t.time ?? null,
    dur,
    rec,
    notes: (t.notes ?? '').slice(0, 10000),
    createdBy: ownerUid,
    createdAt: serverTs(),
    updatedAt: serverTs(),
    completedAt: t.status === 'done' ? serverTs() : null,
  }
  if (t.rems !== undefined) {
    payload.rems = t.rems.filter(k => VALID_REMS.includes(k)).slice(0, pro ? 6 : 1)
  }
  if (t.guide === true) {
    payload.guide = true
  }
  return payload
}

/** Map a partial Task update to Firestore fields; returns null when nothing valid should be sent yet. */
function taskPatchToCloud(patch: Partial<Task>, serverTs: () => FieldValue): UpdateData<DocumentData> | null {
  const out: UpdateData<DocumentData> = {}
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim().slice(0, 300)
    // Skip blank intermediate edits while user is clearing/retyping the title input.
    if (trimmed) out.title = trimmed
  }
  if (patch.area !== undefined) out.area = patch.area
  if (patch.section !== undefined) out.section = patch.section
  if (patch.assignee !== undefined) out.assignee = patch.assignee
  if (patch.status !== undefined) {
    out.status = patch.status
    out.completedAt = patch.status === 'done' ? serverTs() : null
  }
  if (patch.prio !== undefined) out.prio = patch.prio
  if (patch.start !== undefined) out.start = patch.start
  if (patch.due !== undefined) out.due = patch.due
  if (patch.time !== undefined) out.time = patch.time
  if (patch.dur !== undefined) out.dur = patch.dur
  if (patch.rec !== undefined) out.rec = patch.rec
  if (patch.notes !== undefined) out.notes = patch.notes.slice(0, 10000)
  if (patch.rems !== undefined) out.rems = patch.rems.filter(k => VALID_REMS.includes(k))
  if (patch.guide !== undefined) out.guide = patch.guide
  if (!Object.keys(out).length) return null
  out.updatedAt = serverTs()
  return out
}

function sortCloudTasks(items: { task: Task; createdAtMs: number | null }[]): Task[] {
  return [...items]
    .sort((a, b) => {
      // Pending local writes (null serverTimestamp while offline/unacked) stay at the top, newest id first.
      if (a.createdAtMs == null && b.createdAtMs == null) return b.task.id.localeCompare(a.task.id)
      if (a.createdAtMs == null) return -1
      if (b.createdAtMs == null) return 1
      return b.createdAtMs - a.createdAtMs || a.task.id.localeCompare(b.task.id)
    })
    .map(x => x.task)
}

function useStoreValue() {
  const initial = useMemo(load, [])
  // Local store: used in Demo/signed-out mode, and holds Phase-1 local projects, project tasks, and activity when signed in.
  const [localData, setLocalData] = useState<Data>(initial.data)
  const [cloudAreas, setCloudAreas] = useState<Area[]>([])
  const [cloudTasks, setCloudTasks] = useState<Task[]>([])
  // Local draft overlays keep debounced text inputs responsive and immune to intermediate snapshots.
  const [draftTasks, setDraftTasks] = useState<Record<string, Partial<Task>>>({})
  const [draftAreas, setDraftAreas] = useState<Record<string, Partial<Area>>>({})
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [account, setAccountState] = useState<Account>(initial.account)
  const [ui, setUIState] = useState<UI>(UI0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [needsAreas, setNeedsAreas] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authStatus, setAuthStatus] = useState('')
  const [authError, setAuthError] = useState('')
  const [pendingMigration, setPendingMigration] = useState<LocalMigration | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrationError, setMigrationError] = useState('')
  const [firebaseRequested, setFirebaseRequested] = useState(hasRedirectFlag)

  const timer = useRef<number>(undefined)
  const handledUid = useRef<string | null>(null)
  const fbRef = useRef<FirebaseMod | null>(null)
  const cloudAreaOrdersRef = useRef<Map<string, number>>(new Map())
  const localBackupRef = useRef<LocalMigration | null>(initial.migration)
  const rootDataRef = useRef<Data>(initial.rootData)
  const byUidRef = useRef<Record<string, Data>>(initial.byUid)
  const seededRef = useRef(initial.seeded)
  const migratedRef = useRef(initial.migrated)
  const legacyRef = useRef<Data | null>(initial.legacy)
  const migratingRef = useRef(false)
  const pendingWritesRef = useRef<Map<string, PendingWrite>>(new Map())

  const cloudActive = Boolean(uid && account.loggedIn && !account.demo)
  const cloudUidRef = useRef<string | null>(null)
  cloudUidRef.current = cloudActive ? uid : null

  const data = useMemo<Data>(() => {
    if (!cloudActive) return localData
    const mergedAreas = Object.keys(draftAreas).length
      ? cloudAreas.map(a => (draftAreas[a.id] ? { ...a, ...draftAreas[a.id] } : a))
      : cloudAreas
    const mergedCloudTasks = Object.keys(draftTasks).length
      ? cloudTasks.map(t => (draftTasks[t.id] ? { ...t, ...draftTasks[t.id] } : t))
      : cloudTasks
    return {
      areas: mergedAreas,
      tasks: [...mergedCloudTasks, ...localData.tasks.filter(t => t.project != null)],
      projects: localData.projects,
      activity: localData.activity,
    }
  }, [cloudActive, cloudAreas, cloudTasks, draftAreas, draftTasks, localData])

  const dataRef = useRef(data)
  dataRef.current = data
  const localDataRef = useRef(localData)
  localDataRef.current = localData
  const cloudTasksRef = useRef(cloudTasks)
  cloudTasksRef.current = cloudTasks
  const cloudAreasRef = useRef(cloudAreas)
  cloudAreasRef.current = cloudAreas
  const accountRef = useRef(account)
  accountRef.current = account

  const persistLocal = useCallback((nextLocal: Data, nextTheme: Theme, nextAccount: Account) => {
    try {
      // Store signed-in users' Phase-1 local projects per uid so signOut or switching accounts never erases them.
      if (nextAccount.loggedIn && !nextAccount.demo && nextAccount.uid) {
        byUidRef.current = { ...byUidRef.current, [nextAccount.uid]: nextLocal }
      } else if (nextAccount.demo) {
        rootDataRef.current = nextLocal
      }
      localStorage.setItem(KEY, JSON.stringify({
        data: rootDataRef.current,
        byUid: byUidRef.current,
        theme: nextTheme,
        account: nextAccount,
        ...(seededRef.current ? { seeded: true } : {}),
        ...(migratedRef.current ? { migrated: true } : {}),
        ...(legacyRef.current ? { legacy: legacyRef.current } : {}),
      }))
    } catch {
      /* private mode: keep working in memory */
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = account.accent
    persistLocal(localData, theme, account)
  }, [localData, theme, account, persistLocal])

  // Projects live only in localStorage until Phase 2. If another tab saved them, adopt that copy so this tab
  // never overwrites it later with a stale one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        const saved = JSON.parse(e.newValue) as StoredState
        const byUid: Record<string, Data> = {}
        if (saved.byUid && typeof saved.byUid === 'object') {
          for (const [k, v] of Object.entries(saved.byUid)) byUid[k] = normalizeData(v)
        }
        byUidRef.current = byUid
        rootDataRef.current = normalizeData(saved.data)
        legacyRef.current = saved.legacy && saved.migrated !== true ? normalizeData(saved.legacy) : null
        migratedRef.current = saved.migrated === true
        const a = accountRef.current
        const mine = a.demo ? rootDataRef.current : a.loggedIn && a.uid ? byUid[a.uid] : undefined
        if (mine && JSON.stringify(mine) !== JSON.stringify(localDataRef.current)) setLocalData(mine)
      } catch {
        /* ignore a half-written or foreign value */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Keep Mode Demo and first-visit sign-in completely free of Firebase downloads;
  // only dynamically import Firebase when a saved session, redirect return, or Google click needs it.
  const shouldLoadFirebase = !account.demo && (Boolean(account.uid) || firebaseRequested)

  useEffect(() => {
    if (!shouldLoadFirebase || account.demo) return

    let active = true
    let unsubAuth: (() => void) | null = null
    let unsubProfile: (() => void) | null = null
    let unsubAreaGate: (() => void) | null = null
    let waitTimer: number | undefined

    const clearProfileWatch = () => {
      unsubProfile?.()
      unsubProfile = null
      unsubAreaGate?.()
      unsubAreaGate = null
      window.clearTimeout(waitTimer)
    }

    void loadFirebase().then(fb => {
      if (!active || accountRef.current.demo) return
      fbRef.current = fb

      // Surface errors from signInWithRedirect fallback if returning from a redirect flow.
      fb.getRedirectResult(fb.auth)
        .finally(() => setRedirectFlag(false))
        .catch(err => {
          if (!active) return
          setAuthBusy(false)
          setAuthStatus('')
          setAuthError(authErrMsg(err))
        })

      unsubAuth = fb.onAuthStateChanged(fb.auth, fbUser => {
        if (!active || accountRef.current.demo) return
        clearProfileWatch()

        if (!fbUser) {
          handledUid.current = null
          setUid(null)
          setCloudAreas([])
          setCloudTasks([])
          cloudAreaOrdersRef.current = new Map()
          setNeedsAreas(false)
          setAuthBusy(false)
          setAuthStatus('')
          if ((accountRef.current.loggedIn || accountRef.current.uid) && !accountRef.current.demo) {
            setAccountState(a => ({ ...a, uid: undefined, loggedIn: false }))
          }
          return
        }

        setUid(fbUser.uid)
        setAuthError('')
        if (!accountRef.current.loggedIn) {
          setAuthBusy(true)
          setAuthStatus('Menyiapkan akun…')
        }

        // Wait for onUserCreated Cloud Function to materialize users/{uid} on first login.
        waitTimer = window.setTimeout(() => {
          if (!active || handledUid.current === fbUser.uid) return
          setAuthBusy(false)
          setAuthStatus('')
          setAuthError('Profil akun belum siap. Coba lagi sebentar.')
        }, 12000)

        unsubProfile = fb.onSnapshot(
          fb.doc(fb.db, 'users', fbUser.uid),
          snap => {
            if (!active || !snap.exists()) return
            window.clearTimeout(waitTimer)
            setAuthError('')

            const p = snap.data()
            const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : (fbUser.displayName?.trim() || 'Anda')
            // plan is read-only from Firestore and is the source of truth for s.isPro on signed-in accounts.
            const plan: 'free' | 'pro' = p.plan === 'pro' ? 'pro' : 'free'

            if (handledUid.current === fbUser.uid) {
              setAccountState(a => ({
                ...a,
                name,
                plan,
                accent: plan === 'pro' ? a.accent : 'indigo',
              }))
              return
            }
            handledUid.current = fbUser.uid

            // Determine first login vs returning user via onSnapshot so offline IndexedDB cache also works on reload.
            unsubAreaGate = fb.onSnapshot(
              fb.collection(fb.db, 'users', fbUser.uid, 'areas'),
              areasSnap => {
                if (!active) return
                // Wait for server confirmation when an empty snapshot came only from a cold local cache.
                if (areasSnap.empty && areasSnap.metadata.fromCache) return
                unsubAreaGate?.()
                unsubAreaGate = null

                if (areasSnap.empty) {
                  setAccountState(a => ({
                    ...a,
                    uid: fbUser.uid,
                    loggedIn: false,
                    demo: false,
                    name,
                    plan,
                    accent: plan === 'pro' ? a.accent : 'indigo',
                    onboarding: true,
                    checkedAreas: false,
                  }))
                  setNeedsAreas(true)
                  setAuthBusy(false)
                  setAuthStatus('')
                  return
                }

                // Restore this user's own per-uid local projects without leaking demo seed() or another user's projects.
                const userLocal = byUidRef.current[fbUser.uid] ?? EMPTY_DATA
                const orders = new Map<string, number>()
                const initialAreas = areasSnap.docs
                  .map(d => {
                    const x = d.data()
                    const order = typeof x.order === 'number' ? x.order : 999
                    orders.set(d.id, order)
                    return {
                      id: d.id,
                      name: typeof x.name === 'string' ? x.name : d.id,
                      color: typeof x.color === 'string' ? x.color : AREA_COLORS[0],
                      order,
                    }
                  })
                  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
                cloudAreaOrdersRef.current = orders
                setCloudAreas(initialAreas.map(({ id, name: n, color }) => ({ id, name: n, color })))
                setLocalData(userLocal)
                setAccountState(a => ({
                  ...a,
                  uid: fbUser.uid,
                  loggedIn: true,
                  demo: false,
                  name,
                  plan,
                  accent: plan === 'pro' ? a.accent : 'indigo',
                  onboarding: typeof p.onboarding === 'boolean' ? p.onboarding : a.onboarding,
                  checkedAreas: typeof p.checkedAreas === 'boolean' ? p.checkedAreas : a.checkedAreas,
                }))
                setNeedsAreas(false)
                setAuthBusy(false)
                setAuthStatus('')
                // Offer migration to returning users too when pre-backend non-demo local data exists on this browser.
                if (localBackupRef.current) {
                  setMigrationError('')
                  setPendingMigration(localBackupRef.current)
                }
              },
              () => {
                if (!active) return
                handledUid.current = null
                setAuthBusy(false)
                setAuthStatus('')
                setAuthError('Gagal memuat data akun. Coba lagi.')
              },
            )
          },
          () => {
            if (!active) return
            window.clearTimeout(waitTimer)
            setAuthBusy(false)
            setAuthStatus('')
            setAuthError('Gagal memuat profil akun. Coba lagi.')
          },
        )
      })
    }).catch(() => {
      if (!active) return
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError('Gagal memuat layanan akun. Periksa koneksi internet lalu coba lagi.')
    })

    return () => {
      active = false
      clearProfileWatch()
      unsubAuth?.()
    }
  }, [shouldLoadFirebase, account.demo])

  // Subscribe to cloud areas and loose tasks while signed in to a real account.
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !uid || !fb) return

    const unsubAreas = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'areas'), snap => {
      const orders = new Map<string, number>()
      const rows = snap.docs
        .map(d => {
          const x = d.data()
          const order = typeof x.order === 'number' ? x.order : 999
          orders.set(d.id, order)
          return {
            id: d.id,
            name: typeof x.name === 'string' ? x.name : d.id,
            color: typeof x.color === 'string' ? x.color : AREA_COLORS[0],
            order,
          }
        })
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      cloudAreaOrdersRef.current = orders
      setCloudAreas(rows.map(({ id, name, color }) => ({ id, name, color })))
    })

    const unsubTasks = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'tasks'), snap => {
      setCloudTasks(sortCloudTasks(snap.docs.map(docToTask)))
    })

    return () => {
      unsubAreas()
      unsubTasks()
    }
  }, [cloudActive, uid])

  const setAccount = useCallback((patch: Partial<Account>) => setAccountState(a => ({ ...a, ...patch })), [])
  const isPro = account.plan === 'pro' || account.demo
  const isProRef = useRef(isPro)
  isProRef.current = isPro
  const openPro = useCallback((ctx: ProCtx = 'general') => setUIState(u => ({ ...u, pro: ctx })), [])

  const say = useCallback((msg: string, undo: (() => void) | null = null) => {
    setToast({ msg, undo })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2600)
  }, [])

  /** Fire-and-forget wrapper so offline Firestore writes update cache immediately without blocking UI/toast. */
  const runCloud = useCallback((op: Promise<unknown>, fallbackMsg = 'Perubahan gagal disimpan ke cloud') => {
    void op.catch(() => say(fallbackMsg))
  }, [say])

  const clearDraftTask = useCallback((id: string) => {
    setDraftTasks(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const clearDraftArea = useCallback((id: string) => {
    setDraftAreas(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const cancelPendingWrite = useCallback((key: string) => {
    const entry = pendingWritesRef.current.get(key)
    if (!entry) return
    window.clearTimeout(entry.timer)
    pendingWritesRef.current.delete(key)
    if (entry.kind === 'task') clearDraftTask(entry.id)
    else clearDraftArea(entry.id)
  }, [clearDraftArea, clearDraftTask])

  const flushWriteKey = useCallback((key: string) => {
    const entry = pendingWritesRef.current.get(key)
    if (!entry) return
    window.clearTimeout(entry.timer)
    pendingWritesRef.current.delete(key)
    const fb = fbRef.current
    if (!fb) {
      if (entry.kind === 'task') clearDraftTask(entry.id)
      else clearDraftArea(entry.id)
      return
    }

    if (entry.kind === 'task') {
      const cloudPatch = taskPatchToCloud(entry.patch, fb.serverTimestamp)
      if (cloudPatch) {
        // Apply optimistically to cloudTasks too so clearing the draft never flashes stale text.
        setCloudTasks(list => list.map(t => (t.id === entry.id ? { ...t, ...entry.patch } : t)))
        runCloud(fb.updateDoc(fb.doc(fb.db, 'users', entry.uid, 'tasks', entry.id), cloudPatch))
      }
      clearDraftTask(entry.id)
      return
    }

    const areaPatch: UpdateData<DocumentData> = {}
    if (entry.patch.name !== undefined) {
      const trimmed = entry.patch.name.trim().slice(0, 60)
      if (trimmed) areaPatch.name = trimmed
    }
    if (Object.keys(areaPatch).length) {
      setCloudAreas(list => list.map(a => (a.id === entry.id ? { ...a, ...entry.patch } : a)))
      runCloud(fb.updateDoc(fb.doc(fb.db, 'users', entry.uid, 'areas', entry.id), areaPatch))
    }
    clearDraftArea(entry.id)
  }, [clearDraftArea, clearDraftTask, runCloud])

  const flushWrites = useCallback(() => {
    const keys = Array.from(pendingWritesRef.current.keys())
    for (const key of keys) flushWriteKey(key)
  }, [flushWriteKey])

  // Flush pending debounced edits if the user switches tabs, backgrounds the app, or closes the page.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushWrites()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', flushWrites)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flushWrites)
    }
  }, [flushWrites])

  const setUI = useCallback((patch: Partial<UI>) => {
    // Flush pending text edits when closing or switching task detail / area manager so final keystrokes are never lost.
    if ('taskId' in patch || 'overlay' in patch || 'view' in patch) flushWrites()
    setUIState(u => ({ ...u, ...patch }))
  }, [flushWrites])

  /** Apply a local change and show a 6s toast with Urungkan that restores localData exactly as before. */
  const undoable = useCallback((msg: string, mutate: (d: Data) => Data) => {
    const before = localDataRef.current
    setLocalData(mutate)
    say(msg, () => {
      setLocalData(before)
      setToast(null)
    })
  }, [say])

  /** Apply a cloud (and optional local) change with a 6s Urungkan toast that works both online and offline. */
  const undoableCloud = useCallback((
    msg: string,
    applyCloud: () => Promise<unknown>,
    revertCloud: () => Promise<unknown>,
    mutateLocal?: (d: Data) => Data,
  ) => {
    const beforeLocal = localDataRef.current
    if (mutateLocal) setLocalData(mutateLocal)
    runCloud(applyCloud())
    say(msg, () => {
      if (mutateLocal) setLocalData(beforeLocal)
      runCloud(revertCloud(), 'Gagal mengurungkan perubahan')
      setToast(null)
    })
  }, [runCloud, say])

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    const t0 = dataRef.current.tasks.find(x => x.id === id)
    if (curUid && fb && t0 && !t0.project) {
      const textPatch: Partial<Task> = {}
      const immediatePatch: Partial<Task> = {}
      for (const [k, v] of Object.entries(patch) as [keyof Task, Task[keyof Task]][]) {
        if (k === 'title' || k === 'notes') (textPatch as Record<string, unknown>)[k] = v
        else (immediatePatch as Record<string, unknown>)[k] = v
      }

      const key = `task:${id}`
      const hasText = Object.keys(textPatch).length > 0
      const hasImmediate = Object.keys(immediatePatch).length > 0

      if (hasImmediate) {
        // Merge any queued text edit into the immediate write so we do not send two separate writes.
        const pending = pendingWritesRef.current.get(key)
        const combined = pending ? { ...pending.patch, ...patch } : patch
        if (pending) cancelPendingWrite(key)
        const cloudPatch = taskPatchToCloud(combined, fb.serverTimestamp)
        if (cloudPatch) {
          runCloud(fb.updateDoc(fb.doc(fb.db, 'users', curUid, 'tasks', id), cloudPatch))
        }
        return
      }

      if (hasText) {
        setDraftTasks(prev => ({ ...prev, [id]: { ...prev[id], ...textPatch } }))
        const existing = pendingWritesRef.current.get(key)
        if (existing) window.clearTimeout(existing.timer)
        const merged = existing ? { ...existing.patch, ...textPatch } : textPatch
        const t = window.setTimeout(() => flushWriteKey(key), TEXT_DEBOUNCE_MS)
        pendingWritesRef.current.set(key, { kind: 'task', uid: curUid, id, patch: merged, timer: t })
      }
      return
    }
    setLocalData(d => {
      const lt0 = d.tasks.find(x => x.id === id)
      const activity = lt0?.project && patch.status && patch.status !== lt0.status
        ? pushActivity(d.activity, lt0.project, statusActivity(accountRef.current.name, lt0.title, patch.status))
        : d.activity
      return { ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)), activity }
    })
  }, [cancelPendingWrite, flushWriteKey, runCloud])

  const toggleTask = useCallback((id: string) => {
    const t = dataRef.current.tasks.find(x => x.id === id)
    if (!t) return
    if (t.status !== 'done') feedback('done', accountRef.current)
    if (t.rec && t.status !== 'done') {
      const n = nextActiveOccurrence(t)
      const curUid = cloudUidRef.current
      const fb = fbRef.current
      if (curUid && fb && !t.project) {
        const ref = fb.doc(fb.db, 'users', curUid, 'tasks', id)
        undoableCloud(
          `Selesai. Diulang ke ${fmtDay(n)}`,
          () => fb.updateDoc(ref, { due: n, start: null, status: 'todo', updatedAt: fb.serverTimestamp(), completedAt: null }),
          () => fb.updateDoc(ref, { due: t.due, start: t.start, status: t.status, updatedAt: fb.serverTimestamp(), completedAt: null }),
        )
        return
      }
      undoable(`Selesai. Diulang ke ${fmtDay(n)}`, d => ({
        ...d,
        tasks: d.tasks.map(x => (x.id === id ? { ...x, due: n, start: null, status: 'todo' } : x)),
        activity: t.project ? pushActivity(d.activity, t.project, statusActivity(accountRef.current.name, t.title, 'done')) : d.activity,
      }))
      return
    }
    updateTask(id, { status: t.status === 'done' ? 'todo' : 'done' })
  }, [undoable, undoableCloud, updateTask])

  const setStatus = useCallback((id: string, status: Task['status'], withUndo = false) => {
    const t0 = dataRef.current.tasks.find(x => x.id === id)
    if (status === 'done' && t0?.status !== 'done') feedback('done', accountRef.current)
    if (withUndo) {
      const curUid = cloudUidRef.current
      const fb = fbRef.current
      if (curUid && fb && t0 && !t0.project) {
        const ref = fb.doc(fb.db, 'users', curUid, 'tasks', id)
        const prev = t0.status
        undoableCloud(
          `Dipindah ke ${STATUS[status]}`,
          () => fb.updateDoc(ref, { status, updatedAt: fb.serverTimestamp(), completedAt: status === 'done' ? fb.serverTimestamp() : null }),
          () => fb.updateDoc(ref, { status: prev, updatedAt: fb.serverTimestamp(), completedAt: prev === 'done' ? fb.serverTimestamp() : null }),
        )
        return
      }
      undoable(`Dipindah ke ${STATUS[status]}`, d => {
        const lt0 = d.tasks.find(x => x.id === id)
        const activity = lt0?.project && status !== lt0.status
          ? pushActivity(d.activity, lt0.project, statusActivity(accountRef.current.name, lt0.title, status))
          : d.activity
        return { ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, status } : x)), activity }
      })
    } else updateTask(id, { status })
  }, [undoable, undoableCloud, updateTask])

  const deleteTask = useCallback((id: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    const t0 = dataRef.current.tasks.find(x => x.id === id)
    if (curUid && fb && t0 && !t0.project) {
      // Discard any queued text edit before deleting so a late debounce cannot write to a deleted doc.
      cancelPendingWrite(`task:${id}`)
      setUIState(u => ({ ...u, taskId: null }))
      const ref = fb.doc(fb.db, 'users', curUid, 'tasks', id)
      const restore = taskToCloudDoc(t0, curUid, isProRef.current, fb.serverTimestamp)
      undoableCloud(
        'Tugas dihapus',
        () => fb.deleteDoc(ref),
        () => fb.setDoc(ref, restore),
      )
      return
    }
    setUI({ taskId: null })
    undoable('Tugas dihapus', d => ({ ...d, tasks: d.tasks.filter(x => x.id !== id) }))
  }, [cancelPendingWrite, setUI, undoable, undoableCloud])

  const clearGuides = useCallback(() => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const guides = cloudTasksRef.current.filter(t => t.guide)
      if (!guides.length) return
      const pro = isProRef.current
      undoableCloud(
        'Tugas panduan dihapus',
        () => {
          const batch = fb.writeBatch(fb.db)
          guides.forEach(t => batch.delete(fb.doc(fb.db, 'users', curUid, 'tasks', t.id)))
          return batch.commit()
        },
        () => {
          const batch = fb.writeBatch(fb.db)
          guides.forEach(t => batch.set(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), taskToCloudDoc(t, curUid, pro, fb.serverTimestamp)))
          return batch.commit()
        },
      )
      return
    }
    undoable('Tugas panduan dihapus', d => ({ ...d, tasks: d.tasks.filter(t => !t.guide) }))
  }, [undoable, undoableCloud])

  const moveToToday = useCallback((id: string) => updateTask(id, { due: today(), start: null }), [updateTask])

  const moveAllOverdue = useCallback(() => {
    const t0 = today()
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const cloudOverdue = cloudTasksRef.current.filter(t => isOverdue(t, t0))
      const localOverdue = localDataRef.current.tasks.filter(t => t.project != null && isOverdue(t, t0))
      const total = cloudOverdue.length + localOverdue.length
      if (!total) return
      const mutateLocal = localOverdue.length
        ? (d: Data) => ({
            ...d,
            tasks: d.tasks.map(t => (t.project != null && isOverdue(t, t0) ? { ...t, due: t0, start: null } : t)),
          })
        : undefined
      if (!cloudOverdue.length) {
        undoable(`${total} tugas digeser ke Hari Ini`, mutateLocal!)
        return
      }
      undoableCloud(
        `${total} tugas digeser ke Hari Ini`,
        () => {
          const batch = fb.writeBatch(fb.db)
          cloudOverdue.forEach(t => batch.update(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), { due: t0, start: null, updatedAt: fb.serverTimestamp() }))
          return batch.commit()
        },
        () => {
          const batch = fb.writeBatch(fb.db)
          cloudOverdue.forEach(t => batch.update(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), { due: t.due, start: t.start, updatedAt: fb.serverTimestamp() }))
          return batch.commit()
        },
        mutateLocal,
      )
      return
    }
    const n = localDataRef.current.tasks.filter(t => isOverdue(t, t0)).length
    if (!n) return
    undoable(`${n} tugas digeser ke Hari Ini`, d => ({
      ...d,
      tasks: d.tasks.map(t => (isOverdue(t, t0) ? { ...t, due: t0, start: null } : t)),
    }))
  }, [undoable, undoableCloud])

  const moveTask = useCallback((t: Task, v: Dest) => {
    const d = parseDest(v)
    const np = d.project ? dataRef.current.projects.find(p => p.id === d.project) : null
    const assignee = np ? (t.assignee && np.members.includes(t.assignee) ? t.assignee : 'me') : null
    const curUid = cloudUidRef.current
    const fb = fbRef.current

    // In Phase 1, loose tasks live in Firestore and project tasks remain local; crossing the boundary moves the record.
    if (curUid && fb && !t.project && d.project) {
      cancelPendingWrite(`task:${t.id}`)
      const moved: Task = { ...t, project: d.project, area: null, section: d.section, assignee }
      runCloud(fb.deleteDoc(fb.doc(fb.db, 'users', curUid, 'tasks', t.id)))
      setLocalData(x => ({ ...x, tasks: [moved, ...x.tasks.filter(k => k.id !== t.id)] }))
      return
    }
    if (curUid && fb && t.project && !d.project) {
      const moved: Task = { ...t, project: null, area: d.area, section: null, assignee: null }
      setLocalData(x => ({ ...x, tasks: x.tasks.filter(k => k.id !== t.id) }))
      runCloud(fb.setDoc(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), taskToCloudDoc(moved, curUid, isProRef.current, fb.serverTimestamp)))
      return
    }
    updateTask(t.id, { project: d.project, area: d.area, section: d.section, assignee })
  }, [cancelPendingWrite, runCloud, updateTask])

  const addTask = useCallback((input: { title: string; dest: Dest; due: ISODate | null; prio: Priority; pic: string | null }) => {
    const d = parseDest(input.dest)
    const p = d.project ? dataRef.current.projects.find(x => x.id === d.project) : null
    const t: Task = {
      id: 'n' + Date.now(), title: input.title, project: d.project, area: d.area, section: d.section,
      assignee: p ? (input.pic && p.members.includes(input.pic) ? input.pic : 'me') : null,
      status: 'todo', prio: input.prio, start: null, due: input.due, time: null, notes: '', rec: null, dur: null,
    }
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb && !d.project) {
      runCloud(fb.setDoc(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), taskToCloudDoc(t, curUid, isProRef.current, fb.serverTimestamp)))
      return t
    }
    setLocalData(x => ({
      ...x,
      tasks: [t, ...x.tasks],
      activity: d.project ? pushActivity(x.activity, d.project, `${accountRef.current.name} menambahkan "${input.title}"`) : x.activity,
    }))
    return t
  }, [runCloud])

  /** Move a task to another day (and optionally time). A task with a start date shifts as a whole. */
  const moveDue = useCallback((id: string, day: ISODate, time?: string | null) => {
    const t = dataRef.current.tasks.find(x => x.id === id)
    if (!t || (t.due === day && (time === undefined || time === t.time))) return
    const patch: Partial<Task> = { due: day, start: t.start && t.due ? addDays(day, -diffDays(t.due, t.start)) : null }
    if (time !== undefined) patch.time = time
    const suffix = patch.time ? ' · ' + patch.time : time === null && t.time ? ' · tanpa jam' : ''
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb && !t.project) {
      const ref = fb.doc(fb.db, 'users', curUid, 'tasks', id)
      const prev: UpdateData<DocumentData> = { due: t.due, start: t.start, updatedAt: fb.serverTimestamp() }
      if (time !== undefined) prev.time = t.time
      undoableCloud(
        `Dipindah ke ${fmtDay(day)}${suffix}`,
        () => fb.updateDoc(ref, { ...patch, updatedAt: fb.serverTimestamp() }),
        () => fb.updateDoc(ref, prev),
      )
      return
    }
    undoable(`Dipindah ke ${fmtDay(day)}${suffix}`, d => ({ ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  }, [undoable, undoableCloud])

  const updateProject = useCallback((id: string, patch: Partial<Project>) => setLocalData(d => ({ ...d, projects: d.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) })), [])

  /* ----- Kelola proyek: Phase 1 stays local; Phase 2 moves to Firestore ----- */
  const mapProject = (d: Data, id: string, fn: (p: Project) => Project): Data => ({ ...d, projects: d.projects.map(p => (p.id === id ? fn(p) : p)) })

  const renameSection = useCallback((pid: string, old: string, name: string) => setLocalData(d => ({
    ...mapProject(d, pid, p => ({ ...p, sections: p.sections.map(x => (x === old ? name : x)) })),
    tasks: d.tasks.map(t => (t.project === pid && t.section === old ? { ...t, section: name } : t)),
  })), [])

  const addSection = useCallback((pid: string, name: string) => setLocalData(d => mapProject(d, pid, p => (p.sections.includes(name) ? p : { ...p, sections: [...p.sections, name] }))), [])

  const deleteSection = useCallback((pid: string, name: string) => undoable(`Bagian "${name}" dihapus`, d => ({
    ...mapProject(d, pid, p => ({ ...p, sections: p.sections.filter(x => x !== name) })),
    tasks: d.tasks.map(t => (t.project === pid && t.section === name ? { ...t, section: null } : t)),
  })), [undoable])

  const archiveProject = useCallback((p: Project) => {
    setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
    undoable(`"${p.name}" diarsipkan`, d => mapProject(d, p.id, x => ({ ...x, archived: true })))
  }, [undoable])

  const restoreProject = useCallback((p: Project) => {
    if (!isPro && dataRef.current.projects.filter(x => !x.archived).length >= FREE_PROJECT_QUOTA) {
      openPro('proj')
      return false
    }
    setLocalData(d => mapProject(d, p.id, x => ({ ...x, archived: false })))
    say('Proyek dikembalikan')
    return true
  }, [say, isPro, openPro])

  const deleteProject = useCallback((p: Project) => {
    setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
    undoable(`"${p.name}" dihapus`, d => ({
      ...d,
      projects: d.projects.filter(x => x.id !== p.id),
      tasks: d.tasks.filter(t => t.project !== p.id),
      activity: d.activity.filter(a => a.p !== p.id),
    }))
  }, [undoable])

  /* ----- Bagikan proyek ----- */
  const resetInviteToken = useCallback((pid: string) => {
    const cur = dataRef.current.projects.find(p => p.id === pid)?.inviteToken
    let tok = (Math.random().toString(36) + '00000').slice(2, 7)
    while (tok === cur) tok = (Math.random().toString(36) + '00000').slice(2, 7)
    updateProject(pid, { inviteToken: tok })
    say('Tautan baru dibuat. Tautan lama tidak berlaku lagi.')
  }, [say, updateProject])

  const removeMember = useCallback((pid: string, mid: string) => {
    if (mid === 'me') return
    const name = PEOPLE[mid]?.name ?? mid
    undoable(`${name} dikeluarkan`, d => ({
      ...d,
      projects: d.projects.map(p => (p.id === pid ? { ...p, members: p.members.filter(x => x !== mid) } : p)),
      tasks: d.tasks.map(t => (t.project === pid && t.assignee === mid ? { ...t, assignee: 'me' } : t)),
      activity: pushActivity(d.activity, pid, `${name} dikeluarkan dari proyek`),
    }))
  }, [undoable])

  const simulateJoin = useCallback((pid: string) => {
    const p = dataRef.current.projects.find(x => x.id === pid)
    if (!p) return
    const limit = isPro ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA
    if (p.members.length >= limit) {
      say(isPro ? `Kuota ${PRO_MEMBER_QUOTA} anggota penuh` : 'Teman melihat "Proyek ini sudah penuh"')
      return
    }
    const nx = MEMBER_POOL.find(x => !p.members.includes(x))
    if (!nx) {
      say('Semua orang contoh sudah bergabung')
      return
    }
    const name = PEOPLE[nx].name
    setLocalData(d => ({
      ...mapProject(d, pid, x => (x.members.includes(nx) ? x : { ...x, members: [...x.members, nx] })),
      activity: pushActivity(d.activity, pid, `${name} bergabung lewat tautan undangan`),
    }))
    say(`${name} bergabung`)
  }, [isPro, say])

  /* ----- Kelola area ----- */
  const updateArea = useCallback((id: string, patch: Partial<Area>) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const key = `area:${id}`
      if (patch.color !== undefined) {
        const pending = pendingWritesRef.current.get(key)
        const combined = pending ? { ...pending.patch, ...patch } : patch
        if (pending) cancelPendingWrite(key)
        const cloudPatch: UpdateData<DocumentData> = { color: patch.color }
        if (combined.name !== undefined) {
          const trimmed = combined.name.trim().slice(0, 60)
          if (trimmed) cloudPatch.name = trimmed
        }
        // A local project's colour still follows its area.
        setLocalData(d => ({
          ...d,
          projects: d.projects.map(p => (p.area === id ? { ...p, color: patch.color! } : p)),
        }))
        runCloud(fb.updateDoc(fb.doc(fb.db, 'users', curUid, 'areas', id), cloudPatch))
        return
      }
      if (patch.name !== undefined) {
        setDraftAreas(prev => ({ ...prev, [id]: { ...prev[id], name: patch.name } }))
        const existing = pendingWritesRef.current.get(key)
        if (existing) window.clearTimeout(existing.timer)
        const merged = existing ? { ...existing.patch, name: patch.name } : { name: patch.name }
        const t = window.setTimeout(() => flushWriteKey(key), TEXT_DEBOUNCE_MS)
        pendingWritesRef.current.set(key, { kind: 'area', uid: curUid, id, patch: merged, timer: t })
      }
      return
    }
    setLocalData(d => ({
      ...d,
      areas: d.areas.map(a => (a.id === id ? { ...a, ...patch } : a)),
      // A project's colour follows its area.
      projects: patch.color ? d.projects.map(p => (p.area === id ? { ...p, color: patch.color! } : p)) : d.projects,
    }))
  }, [cancelPendingWrite, flushWriteKey, runCloud])

  const addArea = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 60)
    if (!trimmed) return
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const curAreas = dataRef.current.areas
      const used = curAreas.map(a => a.color)
      const color = AREA_COLORS.find(c => !used.includes(c)) ?? AREA_COLORS[curAreas.length % AREA_COLORS.length]
      const maxOrder = Array.from(cloudAreaOrdersRef.current.values()).reduce((m, v) => Math.max(m, v), -1)
      const id = 'a' + Date.now()
      runCloud(fb.setDoc(fb.doc(fb.db, 'users', curUid, 'areas', id), { name: trimmed, color, order: maxOrder + 1 }))
      return
    }
    setLocalData(d => {
      const used = d.areas.map(a => a.color)
      const color = AREA_COLORS.find(c => !used.includes(c)) ?? AREA_COLORS[d.areas.length % AREA_COLORS.length]
      return { ...d, areas: [...d.areas, { id: 'a' + Date.now(), name: trimmed, color }] }
    })
  }, [runCloud])

  const deleteArea = useCallback((a: Area) => {
    setUIState(u => ({ ...u, inboxArea: 'all', projArea: 'all' }))
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      cancelPendingWrite(`area:${a.id}`)
      const prevOrder = cloudAreaOrdersRef.current.get(a.id) ?? 0
      const affected = cloudTasksRef.current.filter(t => t.area === a.id)
      const areaRef = fb.doc(fb.db, 'users', curUid, 'areas', a.id)
      undoableCloud(
        `Area "${a.name}" dihapus`,
        () => {
          const batch = fb.writeBatch(fb.db)
          batch.delete(areaRef)
          affected.forEach(t => batch.update(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), { area: null, updatedAt: fb.serverTimestamp() }))
          return batch.commit()
        },
        () => {
          const batch = fb.writeBatch(fb.db)
          batch.set(areaRef, { name: a.name, color: a.color, order: prevOrder })
          affected.forEach(t => batch.update(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), { area: a.id, updatedAt: fb.serverTimestamp() }))
          return batch.commit()
        },
        d => ({
          ...d,
          projects: d.projects.map(p => (p.area === a.id ? { ...p, area: null } : p)),
        }),
      )
      return
    }
    undoable(`Area "${a.name}" dihapus`, d => ({
      ...d,
      areas: d.areas.filter(x => x.id !== a.id),
      tasks: d.tasks.map(t => (t.area === a.id ? { ...t, area: null } : t)),
      projects: d.projects.map(p => (p.area === a.id ? { ...p, area: null } : p)),
    }))
  }, [cancelPendingWrite, undoable, undoableCloud])

  const createProject = useCallback((name: string, area: string | null, due: ISODate) => {
    const a = dataRef.current.areas.find(x => x.id === area)
    const p: Project = { id: 'p' + Date.now(), name, area, color: a?.color ?? 'var(--accent)', start: today(), due, members: ['me'], sections: [], archived: false }
    setLocalData(d => ({ ...d, projects: [...d.projects, p] }))
    setUI({ view: 'project', projectId: p.id, mode: 'list', taskId: null })
    say(`Proyek "${name}" dibuat`)
  }, [say, setUI])

  /* ----- Akun ----- */
  const startDemo = useCallback(() => {
    // Leaving a real account for the demo loads fresh sample data without touching Firebase or saved per-uid buckets.
    if (!account.demo) {
      // Unmigrated pre-cloud data must survive the demo: stash it so the migration offer still finds it after sign-in.
      if (localBackupRef.current && !legacyRef.current) legacyRef.current = rootDataRef.current
      const fresh = seed()
      rootDataRef.current = fresh
      setLocalData(fresh)
    }
    seededRef.current = true
    setPendingMigration(null)
    setNeedsAreas(false)
    setAuthError('')
    setAuthBusy(false)
    setAuthStatus('')
    setAccountState(a => ({ ...a, uid: undefined, loggedIn: true, demo: true, name: 'Anda', onboarding: false }))
    setUIState(UI0())
  }, [account.demo])

  const signInWithGoogle = useCallback(async () => {
    setAuthError('')
    setAuthBusy(true)
    setAuthStatus('Menghubungkan…')
    setFirebaseRequested(true)
    try {
      const fb = await loadFirebase()
      fbRef.current = fb
      const provider = new fb.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      try {
        await fb.signInWithPopup(fb.auth, provider)
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
        // Fall back to redirect when browser blocks popups; mark redirect so lazy loader runs on return.
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          try {
            setRedirectFlag(true)
            await fb.signInWithRedirect(fb.auth, provider)
            return
          } catch (redirErr) {
            setRedirectFlag(false)
            setAuthBusy(false)
            setAuthStatus('')
            setAuthError(authErrMsg(redirErr))
            return
          }
        }
        setAuthBusy(false)
        setAuthStatus('')
        setAuthError(authErrMsg(err))
      }
    } catch {
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError('Gagal memuat layanan akun. Periksa koneksi internet lalu coba lagi.')
    }
  }, [])

  const completeSetup = useCallback(async (areaIds: string[] = DEFAULT_AREA_IDS) => {
    const fb = fbRef.current ?? await loadFirebase()
    fbRef.current = fb
    const curUid = fb.auth.currentUser?.uid ?? uid
    if (!curUid) {
      setAuthError('Sesi masuk tidak ditemukan. Silakan masuk ulang.')
      return
    }
    const areas: Area[] = AREA_PRESETS
      .map((a, i) => ({ ...a, color: AREA_COLORS[i] }))
      .filter(a => areaIds.includes(a.id))
    if (!areas.length) return

    setAuthError('')
    setAuthBusy(true)
    setAuthStatus('Menyimpan…')
    const guides = guideTasks()

    try {
      const batch = fb.writeBatch(fb.db)
      const orders = new Map<string, number>()
      areas.forEach((a, order) => {
        orders.set(a.id, order)
        batch.set(fb.doc(fb.db, 'users', curUid, 'areas', a.id), {
          name: a.name,
          color: a.color,
          order,
        })
      })
      guides.forEach(t => {
        batch.set(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), taskToCloudDoc(t, curUid, false, fb.serverTimestamp))
      })
      batch.update(fb.doc(fb.db, 'users', curUid), { onboarding: true, checkedAreas: false })
      await batch.commit()

      cloudAreaOrdersRef.current = orders
      setCloudAreas(areas)
      setCloudTasks(guides)
      // Preserve non-demo local projects for this new account; never copy untouched demo seed data.
      const existingUserLocal = byUidRef.current[curUid]
      const localSource = legacyRef.current ?? rootDataRef.current
      const initialUserLocal = existingUserLocal ?? (localBackupRef.current
        ? { ...localSource, areas: [], tasks: localSource.tasks.filter(t => t.project != null) }
        : EMPTY_DATA)
      byUidRef.current = { ...byUidRef.current, [curUid]: initialUserLocal }
      setLocalData(initialUserLocal)
      setAccountState(a => ({ ...a, uid: curUid, loggedIn: true, demo: false, onboarding: true, checkedAreas: false }))
      setNeedsAreas(false)
      setAuthBusy(false)
      setAuthStatus('')
      setUIState(UI0())
      // Offer one-time migration after first login when non-demo local data existed on this device.
      if (localBackupRef.current) {
        setMigrationError('')
        setPendingMigration(localBackupRef.current)
      }
      say(`Selamat datang, ${accountRef.current.name}!`)
    } catch {
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError('Gagal menyimpan area awal. Coba lagi.')
    }
  }, [say, uid])

  const skipMigration = useCallback(() => {
    if (migratingRef.current) return
    migratedRef.current = true
    legacyRef.current = null
    localBackupRef.current = null
    setPendingMigration(null)
    setMigrationError('')
    persistLocal(localDataRef.current, theme, accountRef.current)
  }, [persistLocal, theme])

  /** Move pre-login local areas and loose tasks to Firestore in <=500-write batches; idempotent against double clicks. */
  const migrateLocalData = useCallback(async () => {
    if (migratingRef.current) return
    const fb = fbRef.current ?? await loadFirebase()
    fbRef.current = fb
    const curUid = cloudUidRef.current ?? fb.auth.currentUser?.uid
    const backup = pendingMigration ?? localBackupRef.current
    if (!curUid || !backup) return

    migratingRef.current = true
    setMigrating(true)
    setMigrationError('')

    try {
      const existingAreas = cloudAreasRef.current
      const existingAreaIds = new Set(existingAreas.map(a => a.id))
      const existingAreaByName = new Map(existingAreas.map(a => [a.name.trim().toLowerCase(), a.id]))
      const areaIdMap = new Map<string, string>()
      let nextOrder = Array.from(cloudAreaOrdersRef.current.values()).reduce((m, v) => Math.max(m, v), -1) + 1

      const ops: ((batch: WriteBatch) => void)[] = []
      let movedAreas = 0

      backup.areas.forEach((a, idx) => {
        const cleanName = a.name.trim().slice(0, 60)
        if (!cleanName) return
        const byName = existingAreaByName.get(cleanName.toLowerCase())
        if (existingAreaIds.has(a.id)) {
          areaIdMap.set(a.id, a.id)
          return
        }
        if (byName) {
          areaIdMap.set(a.id, byName)
          return
        }
        const docId = safeDocId(a.id, `loc_area_${idx}`)
        areaIdMap.set(a.id, docId)
        existingAreaIds.add(docId)
        existingAreaByName.set(cleanName.toLowerCase(), docId)
        const order = nextOrder++
        const color = a.color?.trim().slice(0, 60) || AREA_COLORS[order % AREA_COLORS.length]
        movedAreas++
        ops.push(batch => batch.set(fb.doc(fb.db, 'users', curUid, 'areas', docId), { name: cleanName, color, order }))
      })

      const existingTaskIds = new Set(cloudTasksRef.current.map(t => t.id))
      const pro = isProRef.current
      let movedTasks = 0

      backup.tasks.forEach((t, idx) => {
        if (t.project || t.guide) return
        // Keep deterministic IDs so repeated calls never create duplicate docs, and avoid colliding with guide g1..g4.
        const rawId = safeDocId(t.id, `loc_task_${idx}`)
        const docId = /^g\d+$/.test(rawId) ? `mig_${rawId}` : rawId
        if (existingTaskIds.has(docId)) return
        existingTaskIds.add(docId)
        const mappedArea = t.area ? (areaIdMap.get(t.area) ?? (existingAreaIds.has(t.area) ? t.area : null)) : null
        const payload = taskToCloudDoc({ ...t, id: docId, project: null, area: mappedArea, section: null, assignee: null }, curUid, pro, fb.serverTimestamp)
        movedTasks++
        ops.push(batch => batch.set(fb.doc(fb.db, 'users', curUid, 'tasks', docId), payload))
      })

      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = fb.writeBatch(fb.db)
        for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
        await batch.commit()
      }

      migratedRef.current = true
      legacyRef.current = null
      localBackupRef.current = null
      setPendingMigration(null)
      setMigrating(false)
      migratingRef.current = false
      persistLocal(localDataRef.current, theme, accountRef.current)
      const parts = [
        movedAreas ? `${movedAreas} area` : '',
        movedTasks ? `${movedTasks} tugas` : '',
      ].filter(Boolean)
      say(parts.length ? `${parts.join(' dan ')} dipindahkan ke akun Anda` : 'Data lokal sudah ada di akun Anda')
    } catch {
      setMigrating(false)
      migratingRef.current = false
      setMigrationError('Gagal memindahkan data lokal. Coba lagi.')
    }
  }, [pendingMigration, persistLocal, say, theme])

  const signOut = useCallback(async () => {
    if (accountRef.current.demo) {
      setAccountState(a => ({ ...a, loggedIn: false, demo: false }))
      setUIState(UI0())
      return
    }
    // Flush any queued debounced text edits before revoking Firebase Auth credentials.
    flushWrites()
    setRedirectFlag(false)
    setFirebaseRequested(false)
    handledUid.current = null
    setCloudAreas([])
    setCloudTasks([])
    cloudAreaOrdersRef.current = new Map()
    // Clear active in-memory view without erasing byUid[uid] or pre-backend data in localStorage.
    setLocalData(EMPTY_DATA)
    setPendingMigration(null)
    setMigrationError('')
    setNeedsAreas(false)
    setAuthBusy(false)
    setAuthStatus('')
    setAuthError('')
    setAccountState(ACCOUNT0)
    setUIState(UI0())
    try {
      const fb = fbRef.current
      if (fb) await fb.firebaseSignOut(fb.auth)
    } catch {
      /* keep user returned to sign-in screen even if network is down */
    }
  }, [flushWrites])

  const buyPro = useCallback(() => {
    if (cloudUidRef.current) {
      setUIState(u => ({ ...u, pro: null }))
      say('Pembayaran Pro belum aktif di tahap ini.')
      return
    }
    setAccountState(a => ({ ...a, plan: 'pro', demo: false }))
    setUIState(u => ({ ...u, pro: null }))
    say('Pro aktif. Ini simulasi, tidak ada transaksi.')
  }, [say])

  const resetDemo = useCallback(() => {
    setLocalData(seed())
    setUIState(UI0())
    say('Data demo dikembalikan')
  }, [say])

  const markNotified = useCallback((ids: string[]) => setAccountState(a => ({ ...a, notified: [...ids, ...(a.notified ?? [])].slice(0, 300) })), [])

  const go = useCallback((view: View, extra: Partial<UI> = {}) => setUI({ view, taskId: null, overlay: null, ...extra }), [setUI])

  return {
    ...data, data, theme, setTheme, ui, setUI, account, setAccount, isPro, openPro,
    needsAreas, authBusy, authStatus, authError, clearAuthError: () => setAuthError(''),
    pendingMigration, migrating, migrationError, migrateLocalData, skipMigration,
    startDemo, signInWithGoogle, completeSetup, signOut, buyPro, go, toast, setToast, say, flushWrites,
    updateTask, toggleTask, setStatus, deleteTask, clearGuides, markNotified, moveToToday, moveAllOverdue, moveTask, addTask, createProject, resetDemo, moveDue, updateProject,
    renameSection, addSection, deleteSection, archiveProject, restoreProject, deleteProject, resetInviteToken, removeMember, simulateJoin,
    updateArea, addArea, deleteArea,
    todayTasks: data.tasks.filter(t => inToday(t)),
    overdueTasks: data.tasks.filter(t => isOverdue(t)),
  }
}

export type Store = ReturnType<typeof useStoreValue>
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}
