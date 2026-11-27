import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DocumentData, UpdateData, WriteBatch } from 'firebase/firestore'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS, FREE_MEMBER_QUOTA, FREE_PROJECT_QUOTA, MEMBER_POOL, PEOPLE, PRO_MEMBER_QUOTA, STATUS } from './lib/constants'
import { addDays, diffDays, fmtDay, today } from './lib/dates'
import { inToday, isOverdue, nextActiveOccurrence, parseDest, type Dest } from './lib/logic'
import { guideTasks, seed } from './lib/seed'
import { feedback } from './lib/feedback'
import {
  BATCH_LIMIT,
  VALID_REMS,
  authErrMsg,
  docToProject,
  docToTask,
  docsToActivity,
  docsToAreas,
  docsToMembers,
  projectTaskPatchToCloud,
  projectTaskToCloudDoc,
  randomInviteToken,
  safeDocId,
  sortCloudTasks,
  taskPatchToCloud,
  taskToCloudDoc,
} from './lib/cloudCodec'
import {
  ACCOUNT0,
  EMPTY_DATA,
  STORAGE_KEY,
  UI0,
  buildUserMigration,
  clearInviteUrl,
  getPendingInvite,
  hasRedirectFlag,
  loadLocalStore,
  normalizeByUid,
  normalizeData,
  parseInvitePath,
  saveLocalStore,
  setPendingInvite,
  setRedirectFlag,
  type Accent,
  type Account,
  type LocalMigration,
  type ProCtx,
  type StoredState,
  type Theme,
  type UI,
  type View,
} from './lib/localStore'
import { isProForProject, resolvePerson } from './lib/people'
import { WriteQueue } from './lib/writeQueue'
import type { Activity, Area, Data, ISODate, Person, Priority, Project, ProjectMember, Task } from './lib/types'

export type { Accent, Account, LocalMigration, ProCtx, Theme, UI, View }

export interface InviteState {
  status: 'idle' | 'loading' | 'ready' | 'invalid' | 'full' | 'offline'
  projectId?: string
  projectName?: string
  ownerName?: string
  memberCount?: number
  due?: string
  joining?: boolean
}

type FirebaseMod = typeof import('./lib/firebase')

let fbPromise: Promise<FirebaseMod> | null = null
const loadFirebase = (): Promise<FirebaseMod> => (fbPromise ??= import('./lib/firebase'))

interface Toast {
  msg: string
  undo: (() => void) | null
}

const pushActivity = (list: Activity[], p: string, text: string): Activity[] =>
  [{ p, text, ts: Date.now() }, ...list].slice(0, 200)

const statusActivity = (actor: string, title: string, status: Task['status']) =>
  status === 'done' ? `${actor} menyelesaikan "${title}"` : `${actor} memindah "${title}" ke ${STATUS[status]}`

function fnErrMsg(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const msg = (err as { message: string }).message.trim()
    if (msg && !/^internal$/i.test(msg)) return msg
  }
  return fallback
}

function fnErrCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
}

function useStoreValue() {
  const initial = useMemo(loadLocalStore, [])
  // Local store: used in Demo/signed-out mode, and keeps pre-2F local projects safely stashed per uid.
  const [localData, setLocalData] = useState<Data>(initial.data)
  const [cloudAreas, setCloudAreas] = useState<Area[]>([])
  const [cloudTasks, setCloudTasks] = useState<Task[]>([])
  const [cloudActiveProjects, setCloudActiveProjects] = useState<Project[]>([])
  const [cloudArchivedProjects, setCloudArchivedProjects] = useState<Project[]>([])
  const [cloudProjectTasks, setCloudProjectTasks] = useState<Record<string, Task[]>>({})
  const [cloudMembers, setCloudMembers] = useState<Record<string, Record<string, ProjectMember>>>({})
  const [cloudReminders, setCloudReminders] = useState<Record<string, string[]>>({})
  const [cloudActivity, setCloudActivity] = useState<Record<string, Activity[]>>({})
  // Optimistic masks for 6s undoable server actions (archive/delete project, remove member).
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Record<string, true>>({})
  const [hiddenMembers, setHiddenMembers] = useState<Record<string, string[]>>({})
  // Local draft overlays keep debounced text inputs responsive and immune to intermediate snapshots.
  const [draftTasks, setDraftTasks] = useState<Record<string, Partial<Task>>>({})
  const [draftAreas, setDraftAreas] = useState<Record<string, Partial<Area>>>({})
  const [draftProjects, setDraftProjects] = useState<Record<string, Partial<Project>>>({})
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
  const [migrationStatus, setMigrationStatus] = useState('')
  const [migrationError, setMigrationError] = useState('')
  const [firebaseRequested, setFirebaseRequested] = useState(hasRedirectFlag)
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const fromUrl = parseInvitePath()
    if (fromUrl) {
      setPendingInvite(fromUrl)
      return fromUrl
    }
    return getPendingInvite()
  })
  const [inviteState, setInviteState] = useState<InviteState>({ status: 'idle' })
  const [inviteReloadTick, setInviteReloadTick] = useState(0)
  const [joinedProjectId, setJoinedProjectId] = useState<string | null>(null)

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
  const migrationCancelledRef = useRef(false)
  const writeQueueRef = useRef(new WriteQueue())
  const projTaskUnsubsRef = useRef<Map<string, () => void>>(new Map())
  const projMemberUnsubsRef = useRef<Map<string, () => void>>(new Map())
  const knownActivePidsRef = useRef<Set<string>>(new Set())
  const creatingInviteRef = useRef<Set<string>>(new Set())

  const cloudActive = Boolean(uid && account.loggedIn && !account.demo)
  const cloudUidRef = useRef<string | null>(null)
  cloudUidRef.current = cloudActive ? uid : null
  const selfId = cloudActive && uid ? uid : 'me'

  const data = useMemo<Data>(() => {
    if (!cloudActive) return localData

    const mergedAreas = Object.keys(draftAreas).length
      ? cloudAreas.map(a => (draftAreas[a.id] ? { ...a, ...draftAreas[a.id] } : a))
      : cloudAreas

    const rawProjects = [...cloudActiveProjects, ...cloudArchivedProjects]
    const seenPid = new Set<string>()
    const mergedProjects: Project[] = []
    for (const p of rawProjects) {
      if (seenPid.has(p.id) || hiddenProjectIds[p.id]) continue
      seenPid.add(p.id)
      const memberMap = cloudMembers[p.id]
      const myMember = uid ? memberMap?.[uid] : undefined
      const hiddenMids = hiddenMembers[p.id]
      const draft = draftProjects[p.id]
      const members = hiddenMids?.length ? p.members.filter(m => !hiddenMids.includes(m)) : p.members
      // Owner's private area never leaks to other members: member's own members/{uid}.area always wins.
      const resolvedArea = myMember !== undefined ? myMember.area : (p.ownerId === uid ? p.area : null)
      mergedProjects.push({
        ...p,
        area: resolvedArea,
        members,
        ...(draft ?? {}),
      })
    }

    const mergedLooseTasks = Object.keys(draftTasks).length
      ? cloudTasks.map(t => (draftTasks[t.id] ? { ...t, ...draftTasks[t.id] } : t))
      : cloudTasks

    const mergedProjectTasks: Task[] = []
    for (const p of mergedProjects) {
      const list = cloudProjectTasks[p.id]
      if (!list) continue
      for (const t of list) {
        const draft = draftTasks[t.id]
        const rems = t.id in cloudReminders ? cloudReminders[t.id] : undefined
        mergedProjectTasks.push({
          ...t,
          ...(rems !== undefined ? { rems } : {}),
          ...(draft ?? {}),
        })
      }
    }

    const activity = Object.values(cloudActivity).flat().sort((a, b) => b.ts - a.ts)

    return {
      areas: mergedAreas,
      tasks: [...mergedLooseTasks, ...mergedProjectTasks],
      projects: mergedProjects,
      activity,
    }
  }, [
    cloudActive,
    uid,
    localData,
    cloudAreas,
    cloudTasks,
    cloudActiveProjects,
    cloudArchivedProjects,
    cloudProjectTasks,
    cloudMembers,
    cloudReminders,
    cloudActivity,
    hiddenProjectIds,
    hiddenMembers,
    draftAreas,
    draftTasks,
    draftProjects,
  ])

  const dataRef = useRef(data)
  dataRef.current = data
  const localDataRef = useRef(localData)
  localDataRef.current = localData
  const cloudTasksRef = useRef(cloudTasks)
  cloudTasksRef.current = cloudTasks
  const cloudAreasRef = useRef(cloudAreas)
  cloudAreasRef.current = cloudAreas
  const cloudProjectTasksRef = useRef(cloudProjectTasks)
  cloudProjectTasksRef.current = cloudProjectTasks
  const cloudActiveProjectsRef = useRef(cloudActiveProjects)
  cloudActiveProjectsRef.current = cloudActiveProjects
  const cloudArchivedRef = useRef(cloudArchivedProjects)
  cloudArchivedRef.current = cloudArchivedProjects
  const cloudRemindersRef = useRef(cloudReminders)
  cloudRemindersRef.current = cloudReminders
  const hiddenProjectIdsRef = useRef(hiddenProjectIds)
  hiddenProjectIdsRef.current = hiddenProjectIds
  const uiRef = useRef(ui)
  uiRef.current = ui
  const accountRef = useRef(account)
  accountRef.current = account

  const persistLocal = useCallback((nextLocal: Data, nextTheme: Theme, nextAccount: Account) => {
    // Store signed-in users' Phase-1 local projects per uid so pre-2F data survives until 2F migration.
    if (nextAccount.loggedIn && !nextAccount.demo && nextAccount.uid) {
      byUidRef.current = { ...byUidRef.current, [nextAccount.uid]: nextLocal }
    } else if (nextAccount.demo) {
      rootDataRef.current = nextLocal
    }
    saveLocalStore({
      rootData: rootDataRef.current,
      byUid: byUidRef.current,
      theme: nextTheme,
      account: nextAccount,
      seeded: seededRef.current,
      migrated: migratedRef.current,
      legacy: legacyRef.current,
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = account.accent
    persistLocal(localData, theme, account)
  }, [localData, theme, account, persistLocal])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const saved = JSON.parse(e.newValue) as StoredState
        const byUid = normalizeByUid(saved.byUid)
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

  const setAccount = useCallback((patch: Partial<Account>) => setAccountState(a => ({ ...a, ...patch })), [])
  const isPro = account.plan === 'pro' || account.demo
  const isProRef = useRef(isPro)
  isProRef.current = isPro
  const openPro = useCallback((ctx: ProCtx = 'general') => setUIState(u => ({ ...u, pro: ctx })), [])

  const isOwner = useCallback((p: Pick<Project, 'ownerId'> | null | undefined) => {
    if (!p) return false
    return (p.ownerId ?? 'me') === selfId
  }, [selfId])

  const isProFor = useCallback((p: Pick<Project, 'ownerPlan'> | null | undefined) => {
    return isProForProject(p, isPro, account.demo)
  }, [account.demo, isPro])

  const personOf = useCallback((id: string, projectId?: string): Person => {
    return resolvePerson(id, {
      selfId,
      selfName: account.name,
      demo: account.demo,
      membersByProject: cloudMembers,
      projectId,
    })
  }, [account.demo, account.name, cloudMembers, selfId])

  const say = useCallback((msg: string, undo: (() => void) | null = null) => {
    setToast({ msg, undo })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2600)
  }, [])

  /** Fire-and-forget wrapper so offline Firestore writes update cache immediately without blocking UI/toast. */
  const runCloud = useCallback((op: Promise<unknown>, fallbackMsg = 'Perubahan gagal disimpan ke cloud') => {
    void op.catch(() => say(fallbackMsg))
  }, [say])

  // Keep Mode Demo and first-visit sign-in completely free of Firebase downloads;
  // only dynamically import Firebase when a saved session, redirect return, or Google click needs it.
  const shouldLoadFirebase = !account.demo && (Boolean(account.uid) || firebaseRequested)

  const clearCloudProjectListeners = useCallback(() => {
    for (const unsub of projTaskUnsubsRef.current.values()) unsub()
    projTaskUnsubsRef.current.clear()
    for (const unsub of projMemberUnsubsRef.current.values()) unsub()
    projMemberUnsubsRef.current.clear()
    knownActivePidsRef.current = new Set()
  }, [])

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
          clearCloudProjectListeners()
          setUid(null)
          setCloudAreas([])
          setCloudTasks([])
          setCloudActiveProjects([])
          setCloudArchivedProjects([])
          setCloudProjectTasks({})
          setCloudMembers({})
          setCloudReminders({})
          setCloudActivity({})
          setHiddenProjectIds({})
          setHiddenMembers({})
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

                // Restore this user's own per-uid local backup without leaking demo seed() or another user's data.
                const userLocal = byUidRef.current[fbUser.uid] ?? EMPTY_DATA
                const parsed = docsToAreas(areasSnap)
                cloudAreaOrdersRef.current = parsed.orders
                setCloudAreas(parsed.areas)
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
                // Offer migration for any unmigrated pre-login data or per-uid Phase-1 local projects.
                const mig = buildUserMigration(migratedRef.current ? null : localBackupRef.current, userLocal)
                if (mig) {
                  setMigrationError('')
                  setMigrationStatus('')
                  setPendingMigration(mig)
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
  }, [shouldLoadFirebase, account.demo, clearCloudProjectListeners])

  // Subscribe to cloud areas, loose tasks, personal reminders, and active projects while signed in.
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !uid || !fb) return

    const unsubAreas = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'areas'), snap => {
      const parsed = docsToAreas(snap)
      cloudAreaOrdersRef.current = parsed.orders
      setCloudAreas(parsed.areas)
    })

    const unsubTasks = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'tasks'), snap => {
      setCloudTasks(sortCloudTasks(snap.docs.map(d => docToTask(d, null))))
    })

    const unsubReminders = fb.onSnapshot(fb.collection(fb.db, 'users', uid, 'reminders'), snap => {
      const map: Record<string, string[]> = {}
      for (const d of snap.docs) {
        const keys = d.data()?.keys
        if (Array.isArray(keys)) map[d.id] = keys.filter((x): x is string => typeof x === 'string')
      }
      setCloudReminders(map)
    })

    const activeProjQuery = fb.query(
      fb.collection(fb.db, 'projects'),
      fb.where('memberIds', 'array-contains', uid),
      fb.where('archived', '==', false),
    )
    const unsubProjects = fb.onSnapshot(activeProjQuery, snap => {
      const rows = snap.docs.map(d => docToProject(d, uid))
      const nextPids = new Set(rows.map(p => p.id))
      const curUI = uiRef.current

      // If the currently viewed project disappeared unexpectedly (kicked or deleted by owner), leave it cleanly.
      if (
        curUI.view === 'project'
        && curUI.projectId
        && knownActivePidsRef.current.has(curUI.projectId)
        && !nextPids.has(curUI.projectId)
        && !hiddenProjectIdsRef.current[curUI.projectId]
        && !cloudArchivedRef.current.some(ap => ap.id === curUI.projectId)
      ) {
        setUIState(u => ({ ...u, view: 'projects', projectId: null, taskId: null, overlay: null }))
        say('Anda tidak lagi tergabung di proyek ini.')
      }

      knownActivePidsRef.current = nextPids
      setCloudActiveProjects(rows)
      // Remove any stale copy from archived cache if a project was restored on another device.
      setCloudArchivedProjects(prev => (prev.some(p => nextPids.has(p.id)) ? prev.filter(p => !nextPids.has(p.id)) : prev))
    })

    return () => {
      unsubAreas()
      unsubTasks()
      unsubReminders()
      unsubProjects()
      clearCloudProjectListeners()
    }
  }, [cloudActive, uid, clearCloudProjectListeners, say])

  // Compute which projects need live task or member listeners (keeping closed personal projects at 0 member reads).
  const taskSubKey = useMemo(() => {
    if (!cloudActive) return ''
    const pids = new Set(cloudActiveProjects.map(p => p.id))
    if (ui.view === 'project' && ui.projectId && cloudArchivedProjects.some(p => p.id === ui.projectId)) {
      pids.add(ui.projectId)
    }
    return Array.from(pids).sort().join(',')
  }, [cloudActive, cloudActiveProjects, cloudArchivedProjects, ui.view, ui.projectId])

  const memberSubKey = useMemo(() => {
    if (!cloudActive || !uid) return ''
    const pids = new Set<string>()
    for (const p of cloudActiveProjects) {
      if (p.members.length > 1 || (p.ownerId && p.ownerId !== uid)) pids.add(p.id)
    }
    if (
      ui.view === 'project'
      && ui.projectId
      && (cloudActiveProjects.some(p => p.id === ui.projectId) || cloudArchivedProjects.some(p => p.id === ui.projectId))
    ) {
      pids.add(ui.projectId)
    }
    return Array.from(pids).sort().join(',')
  }, [cloudActive, uid, cloudActiveProjects, cloudArchivedProjects, ui.view, ui.projectId])

  // Sync per-project task listeners.
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !fb) return
    const target = new Set(taskSubKey ? taskSubKey.split(',') : [])

    for (const [pid, unsub] of projTaskUnsubsRef.current.entries()) {
      if (!target.has(pid)) {
        unsub()
        projTaskUnsubsRef.current.delete(pid)
        setCloudProjectTasks(prev => {
          if (!(pid in prev)) return prev
          const next = { ...prev }
          delete next[pid]
          return next
        })
      }
    }

    for (const pid of target) {
      if (projTaskUnsubsRef.current.has(pid)) continue
      const unsub = fb.onSnapshot(
        fb.collection(fb.db, 'projects', pid, 'tasks'),
        snap => {
          const sorted = sortCloudTasks(snap.docs.map(d => docToTask(d, pid)))
          setCloudProjectTasks(prev => ({ ...prev, [pid]: sorted }))
        },
        () => {
          /* Permission denied on removal/deletion is handled via the projects query listener without console noise. */
        },
      )
      projTaskUnsubsRef.current.set(pid, unsub)
    }
  }, [cloudActive, taskSubKey])

  // Sync per-project member listeners (shared active projects + currently open project).
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !fb) return
    const target = new Set(memberSubKey ? memberSubKey.split(',') : [])

    for (const [pid, unsub] of projMemberUnsubsRef.current.entries()) {
      if (!target.has(pid)) {
        unsub()
        projMemberUnsubsRef.current.delete(pid)
        setCloudMembers(prev => {
          if (!(pid in prev)) return prev
          const next = { ...prev }
          delete next[pid]
          return next
        })
      }
    }

    for (const pid of target) {
      if (projMemberUnsubsRef.current.has(pid)) continue
      const unsub = fb.onSnapshot(
        fb.collection(fb.db, 'projects', pid, 'members'),
        snap => {
          const parsed = docsToMembers(snap)
          setCloudMembers(prev => ({ ...prev, [pid]: parsed }))
        },
        () => {
          /* Ignore permission-denied if removed or deleted mid-session. */
        },
      )
      projMemberUnsubsRef.current.set(pid, unsub)
    }
  }, [cloudActive, memberSubKey])

  // Load archived projects once when the user opens the Arsip view (BACKEND.md §3.2).
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !uid || !fb || !ui.archives) return
    let active = true
    const q = fb.query(
      fb.collection(fb.db, 'projects'),
      fb.where('memberIds', 'array-contains', uid),
      fb.where('archived', '==', true),
    )
    void fb.getDocs(q).then(snap => {
      if (!active) return
      setCloudArchivedProjects(snap.docs.map(d => docToProject(d, uid)))
    }).catch(() => { /* ignore offline cache miss */ })
    return () => { active = false }
  }, [cloudActive, uid, ui.archives])

  // Load activity history once when ShareProject opens on a Pro-owned project (BACKEND.md §3.2).
  useEffect(() => {
    const fb = fbRef.current
    if (!cloudActive || !fb || ui.overlay !== 'share' || !ui.projectId) return
    const pid = ui.projectId
    const proj = cloudActiveProjects.find(p => p.id === pid) ?? cloudArchivedProjects.find(p => p.id === pid)
    if (!proj || !isProForProject(proj, isProRef.current, false)) return
    let active = true
    const q = fb.query(
      fb.collection(fb.db, 'projects', pid, 'activity'),
      fb.orderBy('createdAt', 'desc'),
      fb.limit(30),
    )
    void fb.getDocs(q).then(snap => {
      if (!active) return
      setCloudActivity(prev => ({ ...prev, [pid]: docsToActivity(snap, pid) }))
    }).catch(() => { /* ignore if not permitted or offline */ })
    return () => { active = false }
  }, [cloudActive, ui.overlay, ui.projectId, cloudActiveProjects, cloudArchivedProjects])

  // Resolve `/invite/{token}` once signed in, past onboarding, and Firestore is ready.
  useEffect(() => {
    if (!inviteToken) {
      setInviteState({ status: 'idle' })
      return
    }
    if (!cloudActive || !uid || needsAreas || account.demo) return
    const fb = fbRef.current
    if (!fb) return
    if (inviteToken.length < 20 || inviteToken.includes('/')) {
      setInviteState({ status: 'invalid' })
      return
    }
    if (!navigator.onLine) {
      setInviteState({ status: 'offline' })
      return
    }
    let active = true
    setInviteState({ status: 'loading' })
    void fb.getDoc(fb.doc(fb.db, 'invites', inviteToken)).then(snap => {
      if (!active) return
      if (!snap.exists()) {
        setInviteState({ status: 'invalid' })
        return
      }
      const d = snap.data() as Record<string, unknown>
      const projectId = typeof d.projectId === 'string' ? d.projectId : ''
      if (d.active !== true || !projectId) {
        setInviteState({ status: 'invalid' })
        return
      }
      const already = cloudActiveProjectsRef.current.some(p => p.id === projectId)
        || cloudArchivedRef.current.some(p => p.id === projectId)
      if (already) {
        setInviteToken(null)
        setPendingInvite(null)
        clearInviteUrl()
        setInviteState({ status: 'idle' })
        setUIState({ ...UI0(), view: 'project', projectId })
        say('Anda sudah tergabung di proyek ini')
        return
      }
      const memberCount = typeof d.memberCount === 'number' ? d.memberCount : 1
      const projectName = typeof d.projectName === 'string' && d.projectName ? d.projectName : 'Proyek tanpa nama'
      const ownerName = typeof d.ownerName === 'string' && d.ownerName ? d.ownerName : 'Seseorang'
      const due = typeof d.due === 'string' ? d.due : ''
      setInviteState({
        status: d.full === true ? 'full' : 'ready',
        projectId,
        projectName,
        ownerName,
        memberCount,
        due,
      })
    }).catch(err => {
      if (!active) return
      const code = fnErrCode(err)
      if (!navigator.onLine || code.includes('unavailable')) {
        setInviteState({ status: 'offline' })
      } else {
        setInviteState({ status: 'invalid' })
      }
    })
    return () => { active = false }
  }, [account.demo, cloudActive, inviteReloadTick, inviteToken, needsAreas, say, uid])

  // If project snapshots arrive slightly after the invite read and confirm membership, open directly.
  useEffect(() => {
    if (!cloudActive || !inviteToken) return
    if (inviteState.status !== 'ready' && inviteState.status !== 'full') return
    const pid = inviteState.projectId
    if (!pid) return
    const already = cloudActiveProjects.some(p => p.id === pid) || cloudArchivedProjects.some(p => p.id === pid)
    if (!already) return
    setInviteToken(null)
    setPendingInvite(null)
    clearInviteUrl()
    setInviteState({ status: 'idle' })
    setUIState({ ...UI0(), view: 'project', projectId: pid })
    say('Anda sudah tergabung di proyek ini')
  }, [cloudActive, cloudActiveProjects, cloudArchivedProjects, inviteState.projectId, inviteState.status, inviteToken, say])

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

  const clearDraftProject = useCallback((id: string) => {
    setDraftProjects(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const cancelPendingWrite = useCallback((key: string) => {
    const entry = writeQueueRef.current.take(key)
    if (!entry) return
    if (entry.kind === 'task') clearDraftTask(entry.id)
    else if (entry.kind === 'area') clearDraftArea(entry.id)
    else clearDraftProject(entry.id)
  }, [clearDraftArea, clearDraftProject, clearDraftTask])

  const flushWriteKey = useCallback((key: string) => {
    const entry = writeQueueRef.current.take(key)
    if (!entry) return
    const fb = fbRef.current
    if (!fb) {
      if (entry.kind === 'task') clearDraftTask(entry.id)
      else if (entry.kind === 'area') clearDraftArea(entry.id)
      else clearDraftProject(entry.id)
      return
    }

    if (entry.kind === 'task') {
      if (entry.projectId) {
        const cloudPatch = projectTaskPatchToCloud(entry.patch, entry.uid, fb.serverTimestamp)
        if (cloudPatch) {
          const pid = entry.projectId
          setCloudProjectTasks(prev => ({
            ...prev,
            [pid]: (prev[pid] ?? []).map(t => (t.id === entry.id ? { ...t, ...entry.patch } : t)),
          }))
          runCloud(fb.updateDoc(fb.doc(fb.db, 'projects', pid, 'tasks', entry.id), cloudPatch))
        }
      } else {
        const cloudPatch = taskPatchToCloud(entry.patch, fb.serverTimestamp)
        if (cloudPatch) {
          // Apply optimistically to cloudTasks too so clearing the draft never flashes stale text.
          setCloudTasks(list => list.map(t => (t.id === entry.id ? { ...t, ...entry.patch } : t)))
          runCloud(fb.updateDoc(fb.doc(fb.db, 'users', entry.uid, 'tasks', entry.id), cloudPatch))
        }
      }
      clearDraftTask(entry.id)
      return
    }

    if (entry.kind === 'area') {
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
      return
    }

    const projPatch: UpdateData<DocumentData> = {}
    if (entry.patch.name !== undefined) {
      const trimmed = entry.patch.name.trim().slice(0, 200)
      if (trimmed) projPatch.name = trimmed
    }
    if (Object.keys(projPatch).length) {
      projPatch.updatedAt = fb.serverTimestamp()
      const existing = dataRef.current.projects.find(p => p.id === entry.id)
      setCloudActiveProjects(list => list.map(p => (p.id === entry.id ? { ...p, ...entry.patch } : p)))
      setCloudArchivedProjects(list => list.map(p => (p.id === entry.id ? { ...p, ...entry.patch } : p)))
      if (existing?.inviteToken && projPatch.name) {
        const batch = fb.writeBatch(fb.db)
        batch.update(fb.doc(fb.db, 'projects', entry.id), projPatch)
        batch.update(fb.doc(fb.db, 'invites', existing.inviteToken), {
          projectName: projPatch.name,
          projectId: existing.id,
          ownerName: accountRef.current.name.trim().slice(0, 100) || 'Anda',
          due: existing.due,
          active: true,
          updatedAt: fb.serverTimestamp(),
        })
        runCloud(batch.commit())
      } else {
        runCloud(fb.updateDoc(fb.doc(fb.db, 'projects', entry.id), projPatch))
      }
    }
    clearDraftProject(entry.id)
  }, [clearDraftArea, clearDraftProject, clearDraftTask, runCloud])

  const flushWrites = useCallback(() => {
    for (const key of writeQueueRef.current.keys()) flushWriteKey(key)
  }, [flushWriteKey])

  const flushAllPending = useCallback(() => {
    flushWrites()
    writeQueueRef.current.flushDelayed()
  }, [flushWrites])

  // Flush pending debounced edits and delayed server actions when the page hides or closes.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushAllPending()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', flushAllPending)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', flushAllPending)
    }
  }, [flushAllPending])

  const setUI = useCallback((patch: Partial<UI>) => {
    // Flush pending text edits when closing or switching task detail / area or project manager.
    if ('taskId' in patch || 'overlay' in patch || 'view' in patch) flushWrites()
    // If the user switches straight to Arsip during a 6s archive/delete undo window, send it now so Arsip is accurate.
    if (patch.archives) writeQueueRef.current.flushDelayed()
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

  /** Delay a Callable Function mutation for 6s so Urungkan cancels it before it ever hits the server. */
  const undoableServer = useCallback((
    msg: string,
    execute: () => Promise<unknown>,
    revertOptimistic: () => void,
  ) => {
    const cancel = writeQueueRef.current.scheduleDelayed(
      () => {
        void execute().catch(() => {
          revertOptimistic()
          say('Koneksi terputus. Perubahan belum tersimpan, coba lagi saat online.')
        })
      },
      revertOptimistic,
    )
    say(msg, () => {
      cancel()
      setToast(null)
    })
  }, [say])

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    const t0 = dataRef.current.tasks.find(x => x.id === id)
    if (curUid && fb && t0) {
      if (t0.project) {
        const pid = t0.project
        const proj = dataRef.current.projects.find(p => p.id === pid)
        const ownerPro = isProForProject(proj, isProRef.current, false)

        // Personal reminders on project tasks live in users/{uid}/reminders/{taskId}.
        if (patch.rems !== undefined) {
          const cleanRems = patch.rems.filter(k => VALID_REMS.includes(k)).slice(0, ownerPro ? 6 : 1)
          setCloudReminders(prev => ({ ...prev, [id]: cleanRems }))
          runCloud(
            fb.setDoc(fb.doc(fb.db, 'users', curUid, 'reminders', id), {
              keys: cleanRems,
              projectId: pid,
              updatedAt: fb.serverTimestamp(),
            }),
          )
        }

        const textPatch: Partial<Task> = {}
        const immediatePatch: Partial<Task> = {}
        for (const [k, v] of Object.entries(patch) as [keyof Task, Task[keyof Task]][]) {
          if (k === 'rems') continue
          if (k === 'title' || k === 'notes') (textPatch as Record<string, unknown>)[k] = v
          else (immediatePatch as Record<string, unknown>)[k] = v
        }

        const key = `task:${id}`
        const hasText = Object.keys(textPatch).length > 0
        const hasImmediate = Object.keys(immediatePatch).length > 0

        if (hasImmediate) {
          const pending = writeQueueRef.current.get(key)
          const combined = pending && pending.kind === 'task' ? { ...pending.patch, ...immediatePatch } : immediatePatch
          if (pending) cancelPendingWrite(key)
          const cloudPatch = projectTaskPatchToCloud(combined, curUid, fb.serverTimestamp)
          if (cloudPatch) {
            runCloud(fb.updateDoc(fb.doc(fb.db, 'projects', pid, 'tasks', id), cloudPatch))
          }
          return
        }

        if (hasText) {
          setDraftTasks(prev => ({ ...prev, [id]: { ...prev[id], ...textPatch } }))
          writeQueueRef.current.queueTask(key, curUid, pid, id, textPatch, () => flushWriteKey(key))
        }
        return
      }

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
        const pending = writeQueueRef.current.get(key)
        const combined = pending && pending.kind === 'task' ? { ...pending.patch, ...patch } : patch
        if (pending) cancelPendingWrite(key)
        const cloudPatch = taskPatchToCloud(combined, fb.serverTimestamp)
        if (cloudPatch) {
          runCloud(fb.updateDoc(fb.doc(fb.db, 'users', curUid, 'tasks', id), cloudPatch))
        }
        return
      }

      if (hasText) {
        setDraftTasks(prev => ({ ...prev, [id]: { ...prev[id], ...textPatch } }))
        writeQueueRef.current.queueTask(key, curUid, null, id, textPatch, () => flushWriteKey(key))
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
      if (curUid && fb) {
        const ref = t.project
          ? fb.doc(fb.db, 'projects', t.project, 'tasks', id)
          : fb.doc(fb.db, 'users', curUid, 'tasks', id)
        const extra = t.project ? { updatedBy: curUid } : {}
        undoableCloud(
          `Selesai. Diulang ke ${fmtDay(n)}`,
          () => fb.updateDoc(ref, { due: n, start: null, status: 'todo', ...extra, updatedAt: fb.serverTimestamp(), completedAt: null }),
          () => fb.updateDoc(ref, { due: t.due, start: t.start, status: t.status, ...extra, updatedAt: fb.serverTimestamp(), completedAt: null }),
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
      if (curUid && fb && t0) {
        const ref = t0.project
          ? fb.doc(fb.db, 'projects', t0.project, 'tasks', id)
          : fb.doc(fb.db, 'users', curUid, 'tasks', id)
        const extra = t0.project ? { updatedBy: curUid } : {}
        const prev = t0.status
        undoableCloud(
          `Dipindah ke ${STATUS[status]}`,
          () => fb.updateDoc(ref, { status, ...extra, updatedAt: fb.serverTimestamp(), completedAt: status === 'done' ? fb.serverTimestamp() : null }),
          () => fb.updateDoc(ref, { status: prev, ...extra, updatedAt: fb.serverTimestamp(), completedAt: prev === 'done' ? fb.serverTimestamp() : null }),
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
    if (curUid && fb && t0) {
      // Discard any queued text edit before deleting so a late debounce cannot write to a deleted doc.
      cancelPendingWrite(`task:${id}`)
      setUIState(u => ({ ...u, taskId: null }))

      if (t0.project) {
        const pid = t0.project
        const proj = dataRef.current.projects.find(p => p.id === pid)
        const ownerPro = isProForProject(proj, isProRef.current, false)
        const ref = fb.doc(fb.db, 'projects', pid, 'tasks', id)
        const restore = projectTaskToCloudDoc(t0, pid, curUid, ownerPro, proj?.members ?? [curUid], fb.serverTimestamp)
        const prevRems = id in cloudRemindersRef.current ? cloudRemindersRef.current[id] : undefined
        const remRef = fb.doc(fb.db, 'users', curUid, 'reminders', id)
        undoableCloud(
          'Tugas dihapus',
          () => {
            const batch = fb.writeBatch(fb.db)
            batch.delete(ref)
            if (prevRems !== undefined) batch.delete(remRef)
            return batch.commit()
          },
          () => {
            const batch = fb.writeBatch(fb.db)
            batch.set(ref, restore)
            if (prevRems !== undefined) {
              batch.set(remRef, { keys: prevRems, projectId: pid, updatedAt: fb.serverTimestamp() })
            }
            return batch.commit()
          },
        )
        return
      }

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
      const looseOverdue = cloudTasksRef.current.filter(t => isOverdue(t, t0))
      const projOverdue: Task[] = []
      for (const list of Object.values(cloudProjectTasksRef.current)) {
        for (const t of list) {
          if (isOverdue(t, t0)) projOverdue.push(t)
        }
      }
      const total = looseOverdue.length + projOverdue.length
      if (!total) return

      const commitMoves = (forward: boolean) => {
        const ops: ((batch: WriteBatch) => void)[] = []
        for (const t of looseOverdue) {
          const ref = fb.doc(fb.db, 'users', curUid, 'tasks', t.id)
          ops.push(b => b.update(ref, {
            due: forward ? t0 : t.due,
            start: forward ? null : t.start,
            updatedAt: fb.serverTimestamp(),
          }))
        }
        for (const t of projOverdue) {
          const ref = fb.doc(fb.db, 'projects', t.project!, 'tasks', t.id)
          ops.push(b => b.update(ref, {
            due: forward ? t0 : t.due,
            start: forward ? null : t.start,
            updatedBy: curUid,
            updatedAt: fb.serverTimestamp(),
          }))
        }
        const promises: Promise<unknown>[] = []
        for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
          const batch = fb.writeBatch(fb.db)
          for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
          promises.push(batch.commit())
        }
        return Promise.all(promises)
      }

      undoableCloud(
        `${total} tugas digeser ke Hari Ini`,
        () => commitMoves(true),
        () => commitMoves(false),
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
    const fallbackPic = cloudUidRef.current ?? 'me'
    const assignee = np ? (t.assignee && np.members.includes(t.assignee) ? t.assignee : fallbackPic) : null
    const curUid = cloudUidRef.current
    const fb = fbRef.current

    if (curUid && fb) {
      cancelPendingWrite(`task:${t.id}`)

      // Moving between loose <-> project or across different projects moves the underlying document in one batch.
      if (t.project !== d.project) {
        const batch = fb.writeBatch(fb.db)
        const remRef = fb.doc(fb.db, 'users', curUid, 'reminders', t.id)
        const curRems = t.project ? cloudRemindersRef.current[t.id] : t.rems

        if (d.project && np) {
          const ownerPro = isProForProject(np, isProRef.current, false)
          const moved: Task = { ...t, project: d.project, area: null, section: d.section, assignee }
          batch.set(
            fb.doc(fb.db, 'projects', d.project, 'tasks', t.id),
            projectTaskToCloudDoc(moved, d.project, curUid, ownerPro, np.members, fb.serverTimestamp),
          )
          if (t.project) {
            batch.delete(fb.doc(fb.db, 'projects', t.project, 'tasks', t.id))
            if (curRems !== undefined) batch.delete(remRef)
          } else {
            batch.delete(fb.doc(fb.db, 'users', curUid, 'tasks', t.id))
          }
          if (curRems !== undefined) {
            batch.set(remRef, {
              keys: curRems.filter(k => VALID_REMS.includes(k)).slice(0, ownerPro ? 6 : 1),
              projectId: d.project,
              updatedAt: fb.serverTimestamp(),
            })
          }
        } else {
          const moved: Task = {
            ...t,
            project: null,
            area: d.area,
            section: null,
            assignee: null,
            ...(curRems !== undefined ? { rems: curRems } : {}),
          }
          batch.set(
            fb.doc(fb.db, 'users', curUid, 'tasks', t.id),
            taskToCloudDoc(moved, curUid, isProRef.current, fb.serverTimestamp),
          )
          if (t.project) {
            batch.delete(fb.doc(fb.db, 'projects', t.project, 'tasks', t.id))
            if (curRems !== undefined) batch.delete(remRef)
          }
        }

        runCloud(batch.commit())
        return
      }
    }

    updateTask(t.id, { project: d.project, area: d.area, section: d.section, assignee })
  }, [cancelPendingWrite, runCloud, updateTask])

  const addTask = useCallback((input: { title: string; dest: Dest; due: ISODate | null; prio: Priority; pic: string | null }) => {
    const d = parseDest(input.dest)
    const p = d.project ? dataRef.current.projects.find(x => x.id === d.project) : null
    const fallbackPic = cloudUidRef.current ?? 'me'
    const t: Task = {
      id: 'n' + Date.now(), title: input.title, project: d.project, area: d.area, section: d.section,
      assignee: p ? (input.pic && p.members.includes(input.pic) ? input.pic : fallbackPic) : null,
      status: 'todo', prio: input.prio, start: null, due: input.due, time: null, notes: '', rec: null, dur: null,
    }
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      if (d.project && p) {
        const ownerPro = isProForProject(p, isProRef.current, false)
        runCloud(
          fb.setDoc(
            fb.doc(fb.db, 'projects', d.project, 'tasks', t.id),
            projectTaskToCloudDoc(t, d.project, curUid, ownerPro, p.members, fb.serverTimestamp),
          ),
        )
        return t
      }
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
    if (curUid && fb) {
      const ref = t.project
        ? fb.doc(fb.db, 'projects', t.project, 'tasks', id)
        : fb.doc(fb.db, 'users', curUid, 'tasks', id)
      const extra = t.project ? { updatedBy: curUid } : {}
      const prev: UpdateData<DocumentData> = { due: t.due, start: t.start, ...extra, updatedAt: fb.serverTimestamp() }
      if (time !== undefined) prev.time = t.time
      undoableCloud(
        `Dipindah ke ${fmtDay(day)}${suffix}`,
        () => fb.updateDoc(ref, { ...patch, ...extra, updatedAt: fb.serverTimestamp() }),
        () => fb.updateDoc(ref, prev),
      )
      return
    }
    undoable(`Dipindah ke ${fmtDay(day)}${suffix}`, d => ({ ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  }, [undoable, undoableCloud])

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === id)
      if (!p) return
      const owner = (p.ownerId ?? curUid) === curUid

      // Non-owner members may ONLY update their own personal area mapping (members/{uid}.area).
      if (!owner) {
        if (patch.area !== undefined) {
          const nextArea = patch.area ?? null
          setCloudMembers(prev => {
            const curMap = prev[id] ?? {}
            const existing = curMap[curUid]
            if (!existing) return prev
            return { ...prev, [id]: { ...curMap, [curUid]: { ...existing, area: nextArea } } }
          })
          runCloud(
            fb.updateDoc(fb.doc(fb.db, 'projects', id, 'members', curUid), {
              area: nextArea,
              updatedAt: fb.serverTimestamp(),
            }),
          )
        }
        return
      }

      const key = `project:${id}`
      const textPatch: Partial<Project> = {}
      const immediate: UpdateData<DocumentData> = {}

      if (patch.name !== undefined) textPatch.name = patch.name
      if (patch.area !== undefined) immediate.ownerArea = patch.area
      if (patch.color !== undefined) immediate.color = patch.color
      if (patch.start !== undefined) immediate.start = patch.start
      if (patch.due !== undefined) immediate.due = patch.due
      if (patch.sections !== undefined) immediate.sections = patch.sections

      const hasImmediate = Object.keys(immediate).length > 0
      const hasText = textPatch.name !== undefined

      if (hasImmediate) {
        const pending = writeQueueRef.current.get(key)
        if (pending && pending.kind === 'project') {
          if (pending.patch.name !== undefined) {
            const trimmed = pending.patch.name.trim().slice(0, 200)
            if (trimmed) immediate.name = trimmed
          }
          cancelPendingWrite(key)
        }
        immediate.updatedAt = fb.serverTimestamp()
        const batch = fb.writeBatch(fb.db)
        batch.update(fb.doc(fb.db, 'projects', id), immediate)
        if (patch.area !== undefined) {
          batch.update(fb.doc(fb.db, 'projects', id, 'members', curUid), {
            area: patch.area ?? null,
            updatedAt: fb.serverTimestamp(),
          })
        }
        if (p.inviteToken && (immediate.name || immediate.due)) {
          batch.update(fb.doc(fb.db, 'invites', p.inviteToken), {
            projectName: (immediate.name as string | undefined) ?? p.name,
            ownerName: accountRef.current.name.trim().slice(0, 100) || 'Anda',
            due: (immediate.due as string | undefined) ?? p.due,
            active: true,
            updatedAt: fb.serverTimestamp(),
          })
        }
        runCloud(batch.commit())
        return
      }

      if (hasText) {
        setDraftProjects(prev => ({ ...prev, [id]: { ...prev[id], ...textPatch } }))
        writeQueueRef.current.queueProject(key, curUid, id, textPatch, () => flushWriteKey(key))
      }
      return
    }
    setLocalData(d => ({ ...d, projects: d.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
  }, [cancelPendingWrite, flushWriteKey, runCloud])

  /* ----- Kelola proyek ----- */
  const mapProject = (d: Data, id: string, fn: (p: Project) => Project): Data => ({ ...d, projects: d.projects.map(p => (p.id === id ? fn(p) : p)) })

  const renameSection = useCallback((pid: string, old: string, name: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === pid)
      if (!p || (p.ownerId ?? curUid) !== curUid) return
      const nextSections = p.sections.map(x => (x === old ? name : x))
      const affected = (cloudProjectTasksRef.current[pid] ?? []).filter(t => t.section === old)
      const ops: ((batch: WriteBatch) => void)[] = [
        b => b.update(fb.doc(fb.db, 'projects', pid), { sections: nextSections, updatedAt: fb.serverTimestamp() }),
        ...affected.map(t => (b: WriteBatch) =>
          b.update(fb.doc(fb.db, 'projects', pid, 'tasks', t.id), {
            section: name,
            updatedBy: curUid,
            updatedAt: fb.serverTimestamp(),
          }),
        ),
      ]
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = fb.writeBatch(fb.db)
        for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
        promises.push(batch.commit())
      }
      runCloud(Promise.all(promises))
      return
    }
    setLocalData(d => ({
      ...mapProject(d, pid, p => ({ ...p, sections: p.sections.map(x => (x === old ? name : x)) })),
      tasks: d.tasks.map(t => (t.project === pid && t.section === old ? { ...t, section: name } : t)),
    }))
  }, [runCloud])

  const addSection = useCallback((pid: string, name: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === pid)
      if (!p || (p.ownerId ?? curUid) !== curUid || p.sections.includes(name)) return
      runCloud(fb.updateDoc(fb.doc(fb.db, 'projects', pid), {
        sections: [...p.sections, name],
        updatedAt: fb.serverTimestamp(),
      }))
      return
    }
    setLocalData(d => mapProject(d, pid, p => (p.sections.includes(name) ? p : { ...p, sections: [...p.sections, name] })))
  }, [runCloud])

  const deleteSection = useCallback((pid: string, name: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === pid)
      if (!p || (p.ownerId ?? curUid) !== curUid) return
      const prevSections = p.sections
      const nextSections = prevSections.filter(x => x !== name)
      const affected = (cloudProjectTasksRef.current[pid] ?? []).filter(t => t.section === name)
      const runBatch = (sections: string[], sectionVal: string | null) => {
        const ops: ((batch: WriteBatch) => void)[] = [
          b => b.update(fb.doc(fb.db, 'projects', pid), { sections, updatedAt: fb.serverTimestamp() }),
          ...affected.map(t => (b: WriteBatch) =>
            b.update(fb.doc(fb.db, 'projects', pid, 'tasks', t.id), {
              section: sectionVal,
              updatedBy: curUid,
              updatedAt: fb.serverTimestamp(),
            }),
          ),
        ]
        const promises: Promise<unknown>[] = []
        for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
          const batch = fb.writeBatch(fb.db)
          for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
          promises.push(batch.commit())
        }
        return Promise.all(promises)
      }
      undoableCloud(
        `Bagian "${name}" dihapus`,
        () => runBatch(nextSections, null),
        () => runBatch(prevSections, name),
      )
      return
    }
    undoable(`Bagian "${name}" dihapus`, d => ({
      ...mapProject(d, pid, p => ({ ...p, sections: p.sections.filter(x => x !== name) })),
      tasks: d.tasks.map(t => (t.project === pid && t.section === name ? { ...t, section: null } : t)),
    }))
  }, [undoable, undoableCloud])

  const archiveProject = useCallback((p: Project) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      if ((p.ownerId ?? curUid) !== curUid) return
      if (!navigator.onLine) {
        say('Butuh koneksi internet untuk melakukan aksi ini.')
        return
      }
      cancelPendingWrite(`project:${p.id}`)
      setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
      setHiddenProjectIds(prev => ({ ...prev, [p.id]: true }))
      const callArchive = fb.httpsCallable<{ projectId: string; archived: boolean }, unknown>(fb.fns, 'setProjectArchived')
      undoableServer(
        `"${p.name}" diarsipkan`,
        async () => {
          await callArchive({ projectId: p.id, archived: true })
          setHiddenProjectIds(prev => {
            if (!(p.id in prev)) return prev
            const next = { ...prev }
            delete next[p.id]
            return next
          })
          setCloudArchivedProjects(prev => (prev.some(x => x.id === p.id) ? prev : [{ ...p, archived: true }, ...prev]))
        },
        () => {
          setHiddenProjectIds(prev => {
            if (!(p.id in prev)) return prev
            const next = { ...prev }
            delete next[p.id]
            return next
          })
        },
      )
      return
    }
    setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
    undoable(`"${p.name}" diarsipkan`, d => mapProject(d, p.id, x => ({ ...x, archived: true })))
  }, [cancelPendingWrite, say, undoable, undoableServer])

  const restoreProject = useCallback(async (p: Project): Promise<boolean> => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    const ownedActive = dataRef.current.projects.filter(x => !x.archived && (x.ownerId ?? selfId) === selfId).length
    if (!isPro && ownedActive >= FREE_PROJECT_QUOTA) {
      openPro('proj')
      return false
    }
    if (curUid && fb) {
      if ((p.ownerId ?? curUid) !== curUid) return false
      if (!navigator.onLine) {
        say('Butuh koneksi internet untuk memulihkan proyek.')
        return false
      }
      setCloudArchivedProjects(prev => prev.filter(x => x.id !== p.id))
      try {
        const callRestore = fb.httpsCallable<{ projectId: string; archived: boolean }, unknown>(fb.fns, 'setProjectArchived')
        await callRestore({ projectId: p.id, archived: false })
        say('Proyek dikembalikan')
        return true
      } catch (err) {
        setCloudArchivedProjects(prev => (prev.some(x => x.id === p.id) ? prev : [p, ...prev]))
        if (fnErrCode(err) === 'functions/resource-exhausted') {
          openPro('proj')
        } else {
          say(fnErrMsg(err, 'Gagal memulihkan proyek.'))
        }
        return false
      }
    }
    setLocalData(d => mapProject(d, p.id, x => ({ ...x, archived: false })))
    say('Proyek dikembalikan')
    return true
  }, [isPro, openPro, say, selfId])

  const deleteProject = useCallback((p: Project) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      if ((p.ownerId ?? curUid) !== curUid) return
      if (!navigator.onLine) {
        say('Butuh koneksi internet untuk melakukan aksi ini.')
        return
      }
      cancelPendingWrite(`project:${p.id}`)
      setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
      setHiddenProjectIds(prev => ({ ...prev, [p.id]: true }))
      const callDelete = fb.httpsCallable<{ projectId: string }, unknown>(fb.fns, 'deleteProject')
      undoableServer(
        `"${p.name}" dihapus`,
        async () => {
          await callDelete({ projectId: p.id })
          setHiddenProjectIds(prev => {
            if (!(p.id in prev)) return prev
            const next = { ...prev }
            delete next[p.id]
            return next
          })
          setCloudArchivedProjects(prev => prev.filter(x => x.id !== p.id))
        },
        () => {
          setHiddenProjectIds(prev => {
            if (!(p.id in prev)) return prev
            const next = { ...prev }
            delete next[p.id]
            return next
          })
        },
      )
      return
    }
    setUIState(u => ({ ...u, view: 'projects', archives: false, taskId: null, overlay: null }))
    undoable(`"${p.name}" dihapus`, d => ({
      ...d,
      projects: d.projects.filter(x => x.id !== p.id),
      tasks: d.tasks.filter(t => t.project !== p.id),
      activity: d.activity.filter(a => a.p !== p.id),
    }))
  }, [cancelPendingWrite, say, undoable, undoableServer])

  /* ----- Bagikan proyek ----- */
  const resetInviteToken = useCallback((pid: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === pid)
      if (!p || (p.ownerId ?? curUid) !== curUid || p.archived) return
      const nextTok = randomInviteToken()
      const limit = isProForProject(p, isProRef.current, false) ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA
      const batch = fb.writeBatch(fb.db)
      if (p.inviteToken && p.inviteToken.length >= 20) {
        batch.update(fb.doc(fb.db, 'invites', p.inviteToken), {
          active: false,
          projectName: p.name,
          ownerName: accountRef.current.name.trim().slice(0, 100) || 'Anda',
          due: p.due,
          updatedAt: fb.serverTimestamp(),
        })
      }
      batch.set(fb.doc(fb.db, 'invites', nextTok), {
        projectId: pid,
        ownerId: curUid,
        active: true,
        createdAt: fb.serverTimestamp(),
        projectName: p.name,
        ownerName: accountRef.current.name.trim().slice(0, 100) || 'Anda',
        memberCount: p.members.length,
        due: p.due,
        full: p.members.length >= limit,
      })
      batch.update(fb.doc(fb.db, 'projects', pid), {
        inviteToken: nextTok,
        updatedAt: fb.serverTimestamp(),
      })
      runCloud(
        batch.commit().then(() => say('Tautan baru dibuat. Tautan lama tidak berlaku lagi.')),
        'Gagal memperbarui tautan undangan',
      )
      return
    }
    const cur = dataRef.current.projects.find(p => p.id === pid)?.inviteToken
    let tok = randomInviteToken()
    while (tok === cur) tok = randomInviteToken()
    updateProject(pid, { inviteToken: tok })
    say('Tautan baru dibuat. Tautan lama tidak berlaku lagi.')
  }, [runCloud, say, updateProject])

  const ensureInviteToken = useCallback((pid: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (!curUid || !fb) return
    const p = dataRef.current.projects.find(x => x.id === pid)
    if (!p || (p.ownerId ?? curUid) !== curUid || p.archived) return
    if (p.inviteToken && p.inviteToken.length >= 20) return
    if (creatingInviteRef.current.has(pid)) return
    creatingInviteRef.current.add(pid)
    const nextTok = randomInviteToken()
    const limit = isProForProject(p, isProRef.current, false) ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA
    const batch = fb.writeBatch(fb.db)
    batch.set(fb.doc(fb.db, 'invites', nextTok), {
      projectId: pid,
      ownerId: curUid,
      active: true,
      createdAt: fb.serverTimestamp(),
      projectName: p.name,
      ownerName: accountRef.current.name.trim().slice(0, 100) || 'Anda',
      memberCount: p.members.length,
      due: p.due,
      full: p.members.length >= limit,
    })
    batch.update(fb.doc(fb.db, 'projects', pid), {
      inviteToken: nextTok,
      updatedAt: fb.serverTimestamp(),
    })
    void batch.commit()
      .catch(() => say('Gagal membuat tautan undangan'))
      .finally(() => {
        creatingInviteRef.current.delete(pid)
      })
  }, [say])

  const dismissInvite = useCallback(() => {
    setInviteToken(null)
    setPendingInvite(null)
    clearInviteUrl()
    setInviteState({ status: 'idle' })
  }, [])

  const retryInvite = useCallback(() => {
    setInviteReloadTick(n => n + 1)
  }, [])

  const acceptInvite = useCallback(async () => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    const tok = inviteToken
    if (!curUid || !fb || !tok) return
    if (!navigator.onLine) {
      setInviteState(prev => ({ ...prev, status: 'offline', joining: false }))
      return
    }
    setInviteState(prev => ({ ...prev, joining: true }))
    try {
      const callJoin = fb.httpsCallable<{ token: string }, { projectId: string; alreadyMember: boolean }>(fb.fns, 'joinProject')
      const res = await callJoin({ token: tok })
      const pid = res.data.projectId
      // Pull project doc immediately so ProjectView does not flash "Proyek tidak ditemukan." while snapshot arrives.
      const alreadyLocal = cloudActiveProjectsRef.current.some(p => p.id === pid)
      if (!alreadyLocal) {
        try {
          const snap = await fb.getDoc(fb.doc(fb.db, 'projects', pid))
          if (snap.exists()) {
            const proj = docToProject(snap, curUid)
            if (proj.archived) {
              setCloudArchivedProjects(prev => (prev.some(x => x.id === pid) ? prev : [proj, ...prev]))
            } else {
              setCloudActiveProjects(prev => (prev.some(x => x.id === pid) ? prev : [...prev, proj]))
            }
          }
        } catch {
          /* active project listener still delivers it */
        }
      }
      setInviteToken(null)
      setPendingInvite(null)
      clearInviteUrl()
      setInviteState({ status: 'idle' })
      setUIState({ ...UI0(), view: 'project', projectId: pid })
      if (res.data.alreadyMember) {
        say('Anda sudah tergabung di proyek ini')
      } else {
        setJoinedProjectId(pid)
      }
    } catch (err) {
      const code = fnErrCode(err)
      if (!navigator.onLine || code.includes('unavailable')) {
        setInviteState(prev => ({ ...prev, status: 'offline', joining: false }))
      } else if (code.includes('resource-exhausted')) {
        setInviteState(prev => ({ ...prev, status: 'full', joining: false }))
      } else {
        setInviteState({ status: 'invalid' })
      }
    }
  }, [inviteToken, say])

  const pickJoinedArea = useCallback((areaId: string | null) => {
    const pid = joinedProjectId
    setJoinedProjectId(null)
    if (!pid || !areaId) return
    updateProject(pid, { area: areaId })
    say('Proyek dimasukkan ke area')
  }, [joinedProjectId, say, updateProject])

  const removeMember = useCallback((pid: string, mid: string) => {
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      const p = dataRef.current.projects.find(x => x.id === pid)
      if (!p || (p.ownerId ?? curUid) !== curUid || mid === curUid) return
      if (!navigator.onLine) {
        say('Butuh koneksi internet untuk melakukan aksi ini.')
        return
      }
      const name = resolvePerson(mid, {
        selfId: curUid,
        selfName: accountRef.current.name,
        demo: false,
        membersByProject: cloudMembers,
        projectId: pid,
      }).name
      setHiddenMembers(prev => ({
        ...prev,
        [pid]: prev[pid]?.includes(mid) ? prev[pid] : [...(prev[pid] ?? []), mid],
      }))
      const callRemove = fb.httpsCallable<{ projectId: string; memberUid: string }, unknown>(fb.fns, 'removeMember')
      undoableServer(
        `${name} dikeluarkan`,
        async () => {
          await callRemove({ projectId: pid, memberUid: mid })
          setHiddenMembers(prev => ({
            ...prev,
            [pid]: (prev[pid] ?? []).filter(x => x !== mid),
          }))
        },
        () => {
          setHiddenMembers(prev => ({
            ...prev,
            [pid]: (prev[pid] ?? []).filter(x => x !== mid),
          }))
        },
      )
      return
    }
    if (mid === 'me') return
    const name = PEOPLE[mid]?.name ?? mid
    undoable(`${name} dikeluarkan`, d => ({
      ...d,
      projects: d.projects.map(p => (p.id === pid ? { ...p, members: p.members.filter(x => x !== mid) } : p)),
      tasks: d.tasks.map(t => (t.project === pid && t.assignee === mid ? { ...t, assignee: 'me' } : t)),
      activity: pushActivity(d.activity, pid, `${name} dikeluarkan dari proyek`),
    }))
  }, [cloudMembers, say, undoable, undoableServer])

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
        const pending = writeQueueRef.current.get(key)
        const combined = pending && pending.kind === 'area' ? { ...pending.patch, ...patch } : patch
        if (pending) cancelPendingWrite(key)
        const cloudPatch: UpdateData<DocumentData> = { color: patch.color }
        if (combined.name !== undefined) {
          const trimmed = combined.name.trim().slice(0, 60)
          if (trimmed) cloudPatch.name = trimmed
        }
        const batch = fb.writeBatch(fb.db)
        batch.update(fb.doc(fb.db, 'users', curUid, 'areas', id), cloudPatch)
        // Update marker colour for owned cloud projects placed in this area.
        for (const p of dataRef.current.projects) {
          if ((p.ownerId ?? curUid) === curUid && p.area === id) {
            batch.update(fb.doc(fb.db, 'projects', p.id), { color: patch.color, updatedAt: fb.serverTimestamp() })
          }
        }
        runCloud(batch.commit())
        return
      }
      if (patch.name !== undefined) {
        setDraftAreas(prev => ({ ...prev, [id]: { ...prev[id], name: patch.name } }))
        writeQueueRef.current.queueArea(key, curUid, id, { name: patch.name }, () => flushWriteKey(key))
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
      const affectedTasks = cloudTasksRef.current.filter(t => t.area === a.id)
      const affectedProjects = dataRef.current.projects.filter(p => p.area === a.id)
      const areaRef = fb.doc(fb.db, 'users', curUid, 'areas', a.id)

      const runAreaCleanup = (restore: boolean) => {
        const ops: ((batch: WriteBatch) => void)[] = [
          restore
            ? b => b.set(areaRef, { name: a.name, color: a.color, order: prevOrder })
            : b => b.delete(areaRef),
          ...affectedTasks.map(t => (b: WriteBatch) =>
            b.update(fb.doc(fb.db, 'users', curUid, 'tasks', t.id), {
              area: restore ? a.id : null,
              updatedAt: fb.serverTimestamp(),
            }),
          ),
          ...affectedProjects.flatMap(p => {
            const items: ((b: WriteBatch) => void)[] = []
            if ((p.ownerId ?? curUid) === curUid) {
              items.push(b => b.update(fb.doc(fb.db, 'projects', p.id), {
                ownerArea: restore ? a.id : null,
                updatedAt: fb.serverTimestamp(),
              }))
            }
            if (cloudMembers[p.id]?.[curUid]) {
              items.push(b => b.update(fb.doc(fb.db, 'projects', p.id, 'members', curUid), {
                area: restore ? a.id : null,
                updatedAt: fb.serverTimestamp(),
              }))
            }
            return items
          }),
        ]
        const promises: Promise<unknown>[] = []
        for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
          const batch = fb.writeBatch(fb.db)
          for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
          promises.push(batch.commit())
        }
        return Promise.all(promises)
      }

      undoableCloud(
        `Area "${a.name}" dihapus`,
        () => runAreaCleanup(false),
        () => runAreaCleanup(true),
      )
      return
    }
    undoable(`Area "${a.name}" dihapus`, d => ({
      ...d,
      areas: d.areas.filter(x => x.id !== a.id),
      tasks: d.tasks.map(t => (t.area === a.id ? { ...t, area: null } : t)),
      projects: d.projects.map(p => (p.area === a.id ? { ...p, area: null } : p)),
    }))
  }, [cancelPendingWrite, cloudMembers, undoable, undoableCloud])

  const createProject = useCallback(async (name: string, area: string | null, due: ISODate): Promise<boolean> => {
    const a = dataRef.current.areas.find(x => x.id === area)
    const color = a?.color ?? 'var(--accent)'
    const curUid = cloudUidRef.current
    const fb = fbRef.current
    if (curUid && fb) {
      if (!navigator.onLine) {
        say('Butuh koneksi internet untuk membuat proyek.')
        return false
      }
      try {
        const callCreate = fb.httpsCallable<
          { name: string; ownerArea: string | null; color: string; start: string; due: string; sections: string[] },
          { projectId: string }
        >(fb.fns, 'createProject')
        const res = await callCreate({ name, ownerArea: area, color, start: today(), due, sections: [] })
        const pid = res.data.projectId
        const fallbackProj: Project = {
          id: pid,
          ownerId: curUid,
          ownerPlan: isProRef.current ? 'pro' : 'free',
          name,
          area,
          color,
          start: today(),
          due,
          members: [curUid],
          memberCount: 1,
          sections: [],
          archived: false,
          inviteToken: undefined,
        }
        try {
          const snap = await fb.getDoc(fb.doc(fb.db, 'projects', pid))
          const proj = snap.exists() ? docToProject(snap, curUid) : fallbackProj
          setCloudActiveProjects(prev => (prev.some(x => x.id === pid) ? prev : [...prev, proj]))
        } catch {
          setCloudActiveProjects(prev => (prev.some(x => x.id === pid) ? prev : [...prev, fallbackProj]))
        }
        setUI({ view: 'project', projectId: pid, mode: 'list', taskId: null })
        say(`Proyek "${name}" dibuat`)
        return true
      } catch (err) {
        if (fnErrCode(err) === 'functions/resource-exhausted') {
          openPro('proj')
        } else {
          say(fnErrMsg(err, 'Gagal membuat proyek.'))
        }
        return false
      }
    }
    const p: Project = { id: 'p' + Date.now(), name, area, color, start: today(), due, members: ['me'], sections: [], archived: false }
    setLocalData(d => ({ ...d, projects: [...d.projects, p] }))
    setUI({ view: 'project', projectId: p.id, mode: 'list', taskId: null })
    say(`Proyek "${name}" dibuat`)
    return true
  }, [openPro, say, setUI])

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
    setJoinedProjectId(null)
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
      // Offer one-time migration after first login when pre-login data or local projects exist.
      const mig = buildUserMigration(migratedRef.current ? null : localBackupRef.current, initialUserLocal)
      if (mig) {
        setMigrationError('')
        setMigrationStatus('')
        setPendingMigration(mig)
      }
      say(`Selamat datang, ${accountRef.current.name}!`)
    } catch {
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError('Gagal menyimpan area awal. Coba lagi.')
    }
  }, [say, uid])

  const openLocalMigration = useCallback(() => {
    const curUid = cloudUidRef.current
    if (!curUid) return
    const mig = buildUserMigration(migratedRef.current ? null : localBackupRef.current, byUidRef.current[curUid])
    if (!mig) return
    setMigrationError('')
    setMigrationStatus('')
    setPendingMigration(mig)
  }, [])

  const abortMigration = useCallback(() => {
    if (!migratingRef.current) return
    migrationCancelledRef.current = true
    setMigrationStatus('Membatalkan setelah proyek ini selesai…')
  }, [])

  const skipMigration = useCallback(() => {
    if (migratingRef.current) return
    migratedRef.current = true
    legacyRef.current = null
    localBackupRef.current = null
    setPendingMigration(null)
    setMigrationError('')
    setMigrationStatus('')
    persistLocal(localDataRef.current, theme, accountRef.current)
  }, [persistLocal, theme])

  /** Move local areas, loose tasks, and local projects to Firestore safely (idempotent, quota-aware, cancellable). */
  const migrateLocalData = useCallback(async () => {
    if (migratingRef.current) return
    const fb = fbRef.current ?? await loadFirebase()
    fbRef.current = fb
    const curUid = cloudUidRef.current ?? fb.auth.currentUser?.uid
    const backup = pendingMigration ?? (curUid
      ? buildUserMigration(migratedRef.current ? null : localBackupRef.current, byUidRef.current[curUid])
      : null)
    if (!curUid || !backup) return
    if (backup.projects.length > 0 && !navigator.onLine) {
      setMigrationError('Butuh koneksi internet untuk memindahkan proyek lokal.')
      return
    }

    migratingRef.current = true
    migrationCancelledRef.current = false
    setMigrating(true)
    setMigrationError('')
    setMigrationStatus(backup.areas.length || backup.tasks.length ? 'Memindahkan area dan tugas…' : 'Mempersiapkan pemindahan proyek…')

    const migratedPids = new Set<string>()
    const migratedTids = new Set<string>()
    let movedAreas = 0
    let movedTasks = 0
    let movedProjects = 0
    let movedProjectTasks = 0
    let areasAndLooseDone = backup.areas.length === 0 && backup.tasks.length === 0

    try {
      const existingAreas = cloudAreasRef.current
      const existingAreaIds = new Set(existingAreas.map(a => a.id))
      const existingAreaByName = new Map(existingAreas.map(a => [a.name.trim().toLowerCase(), a.id]))
      const areaIdMap = new Map<string, string>()
      let nextOrder = Array.from(cloudAreaOrdersRef.current.values()).reduce((m, v) => Math.max(m, v), -1) + 1

      const ops: ((batch: WriteBatch) => void)[] = []

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
      areasAndLooseDone = true
      // Keep any unmigrated pre-login projects safely inside per-uid local backup before clearing legacyRef.
      if (backup.projects.length > 0) {
        const baseLocal = byUidRef.current[curUid] ?? EMPTY_DATA
        const seenPids = new Set(baseLocal.projects.map(p => p.id))
        const seenTids = new Set(baseLocal.tasks.map(t => t.id))
        const mergedLocal: Data = {
          ...baseLocal,
          projects: [...baseLocal.projects, ...backup.projects.filter(p => !seenPids.has(p.id))],
          tasks: [...baseLocal.tasks, ...backup.projectTasks.filter(t => !seenTids.has(t.id))],
        }
        byUidRef.current = { ...byUidRef.current, [curUid]: mergedLocal }
        setLocalData(mergedLocal)
        persistLocal(mergedLocal, theme, accountRef.current)
      } else {
        persistLocal(localDataRef.current, theme, accountRef.current)
      }

      // Migrate archived local projects before active ones so archived projects don't hold active quota slots.
      const orderedProjects = [
        ...backup.projects.filter(p => p.archived),
        ...backup.projects.filter(p => !p.archived),
      ]
      const uidTag = curUid.replace(/[^a-zA-Z0-9_-]/g, '') || 'u'
      const callCreate = fb.httpsCallable<
        { projectId: string; name: string; ownerArea: string | null; color: string; start: string; due: string; sections: string[] },
        { projectId: string; alreadyExisted?: boolean }
      >(fb.fns, 'createProject')
      const callArchive = fb.httpsCallable<{ projectId: string; archived: boolean }, unknown>(fb.fns, 'setProjectArchived')

      let quotaHit = false
      let cancelled = false

      for (let i = 0; i < orderedProjects.length; i++) {
        if (migrationCancelledRef.current) {
          cancelled = true
          break
        }
        const p = orderedProjects[i]
        setMigrationStatus(`Memindahkan proyek ${i + 1} dari ${orderedProjects.length}…`)

        const name = p.name.trim().slice(0, 200) || 'Proyek tanpa nama'
        const color = p.color?.trim().slice(0, 60) || AREA_COLORS[0]
        const due = typeof p.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : today()
        const rawStart = typeof p.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.start) ? p.start : due
        const start = rawStart <= due ? rawStart : due
        const mappedArea = p.area ? (areaIdMap.get(p.area) ?? (existingAreaIds.has(p.area) ? p.area : null)) : null
        const cleanSections: string[] = []
        let secChars = 0
        for (const rawSec of p.sections ?? []) {
          const sec = typeof rawSec === 'string' ? rawSec.trim().slice(0, 100) : ''
          if (!sec || cleanSections.length >= 50 || secChars + sec.length > 5000) continue
          cleanSections.push(sec)
          secChars += sec.length
        }

        const cloudPid = `mig_${uidTag}_${safeDocId(p.id, `p${i}`)}`.slice(0, 100)
        let alreadyExisted = false
        try {
          const res = await callCreate({ projectId: cloudPid, name, ownerArea: mappedArea, color, start, due, sections: cleanSections })
          alreadyExisted = Boolean(res.data?.alreadyExisted)
        } catch (err) {
          if (fnErrCode(err) === 'functions/resource-exhausted') {
            quotaHit = true
            break
          }
          throw err
        }

        const pTasks = backup.projectTasks.filter(t => t.project === p.id)
        const existingProjTaskIds = new Set<string>()
        if (alreadyExisted) {
          const existingSnap = await fb.getDocs(fb.collection(fb.db, 'projects', cloudPid, 'tasks'))
          for (const docSnap of existingSnap.docs) existingProjTaskIds.add(docSnap.id)
        }

        const projOps: ((batch: WriteBatch) => void)[] = []
        const seenProjTaskIds = new Set<string>()
        pTasks.forEach((t, tIdx) => {
          const cloudTid = safeDocId(t.id, `mig_pt_${i}_${tIdx}`)
          if (seenProjTaskIds.has(cloudTid) || existingProjTaskIds.has(cloudTid)) return
          seenProjTaskIds.add(cloudTid)
          // Local PIC `'me'` maps to the user's UID; simulated sample people clear to unassigned (`null`).
          const assignee = t.assignee === 'me' || t.assignee === curUid ? curUid : null
          const section = t.section && cleanSections.includes(t.section) ? t.section : null
          const payload = projectTaskToCloudDoc(
            { ...t, id: cloudTid, section, assignee },
            cloudPid,
            curUid,
            pro,
            [curUid],
            fb.serverTimestamp,
          )
          projOps.push(batch => batch.set(fb.doc(fb.db, 'projects', cloudPid, 'tasks', cloudTid), payload))
          if (t.rems?.length && t.due) {
            const cleanRems = t.rems.filter(k => VALID_REMS.includes(k)).slice(0, pro ? 6 : 1)
            if (cleanRems.length) {
              projOps.push(batch =>
                batch.set(fb.doc(fb.db, 'users', curUid, 'reminders', cloudTid), {
                  keys: cleanRems,
                  projectId: cloudPid,
                  updatedAt: fb.serverTimestamp(),
                }),
              )
            }
          }
        })

        for (let j = 0; j < projOps.length; j += BATCH_LIMIT) {
          const batch = fb.writeBatch(fb.db)
          for (const op of projOps.slice(j, j + BATCH_LIMIT)) op(batch)
          await batch.commit()
        }

        if (p.archived) {
          await callArchive({ projectId: cloudPid, archived: true })
        }

        // Remove ONLY after server writes are confirmed so crashes or cancellations never lose local projects.
        migratedPids.add(p.id)
        for (const t of pTasks) migratedTids.add(t.id)
        movedProjects++
        movedProjectTasks += pTasks.length

        const curUserLocal = byUidRef.current[curUid]
        if (curUserLocal) {
          const nextUserLocal: Data = {
            ...curUserLocal,
            projects: curUserLocal.projects.filter(x => !migratedPids.has(x.id)),
            tasks: curUserLocal.tasks.filter(x => !migratedTids.has(x.id) && !migratedPids.has(x.project ?? '')),
          }
          byUidRef.current = { ...byUidRef.current, [curUid]: nextUserLocal }
          setLocalData(nextUserLocal)
          persistLocal(nextUserLocal, theme, accountRef.current)
        }
      }

      const remainingProjects = backup.projects.filter(p => !migratedPids.has(p.id))
      const remainingProjectTasks = backup.projectTasks.filter(t => !migratedPids.has(t.project ?? ''))

      setMigrating(false)
      migratingRef.current = false
      setMigrationStatus('')

      if (remainingProjects.length === 0) {
        setPendingMigration(null)
        const parts = [
          movedAreas ? `${movedAreas} area` : '',
          movedTasks ? `${movedTasks} tugas` : '',
          movedProjects ? `${movedProjects} proyek` : '',
          movedProjectTasks ? `${movedProjectTasks} tugas proyek` : '',
        ].filter(Boolean)
        say(parts.length ? `${parts.join(', ')} dipindahkan ke akun Anda` : 'Data lokal sudah ada di akun Anda')
      } else if (quotaHit) {
        setPendingMigration({ areas: [], tasks: [], projects: remainingProjects, projectTasks: remainingProjectTasks })
        const movedMsg = movedProjects ? `${movedProjects} proyek dipindahkan; ` : ''
        setMigrationError(
          `Kuota ${FREE_PROJECT_QUOTA} proyek aktif penuh. ${movedMsg}${remainingProjects.length} proyek tersisa tetap tersimpan di perangkat ini. Arsipkan proyek lain atau beralih ke Pro lalu coba lagi.`,
        )
      } else if (cancelled) {
        setPendingMigration({ areas: [], tasks: [], projects: remainingProjects, projectTasks: remainingProjectTasks })
        const movedMsg = movedProjects ? `${movedProjects} proyek sudah dipindah; ` : ''
        setMigrationError(
          `Pemindahan dibatalkan. ${movedMsg}${remainingProjects.length} proyek tersisa masih aman di perangkat ini.`,
        )
      }
    } catch {
      const remainingProjects = backup.projects.filter(p => !migratedPids.has(p.id))
      const remainingProjectTasks = backup.projectTasks.filter(t => !migratedPids.has(t.project ?? ''))
      if (areasAndLooseDone || migratedPids.size > 0) {
        setPendingMigration({
          areas: areasAndLooseDone ? [] : backup.areas,
          tasks: areasAndLooseDone ? [] : backup.tasks,
          projects: remainingProjects,
          projectTasks: remainingProjectTasks,
        })
      }
      setMigrating(false)
      migratingRef.current = false
      setMigrationStatus('')
      setMigrationError('Gagal memindahkan data lokal. Data yang belum pindah tetap tersimpan di perangkat ini. Coba lagi.')
    }
  }, [pendingMigration, persistLocal, say, theme])

  const signOut = useCallback(async () => {
    if (accountRef.current.demo) {
      setAccountState(a => ({ ...a, loggedIn: false, demo: false }))
      setUIState(UI0())
      return
    }
    // Flush queued text edits and pending 6s server actions before revoking Auth credentials.
    flushAllPending()
    clearCloudProjectListeners()
    setRedirectFlag(false)
    setFirebaseRequested(false)
    handledUid.current = null
    setCloudAreas([])
    setCloudTasks([])
    setCloudActiveProjects([])
    setCloudArchivedProjects([])
    setCloudProjectTasks({})
    setCloudMembers({})
    setCloudReminders({})
    setCloudActivity({})
    setHiddenProjectIds({})
    setHiddenMembers({})
    cloudAreaOrdersRef.current = new Map()
    creatingInviteRef.current.clear()
    setInviteToken(null)
    setPendingInvite(null)
    clearInviteUrl()
    setInviteState({ status: 'idle' })
    setJoinedProjectId(null)
    // Clear active in-memory view without erasing byUid[uid] or pre-backend data in localStorage.
    setLocalData(EMPTY_DATA)
    setPendingMigration(null)
    setMigrationStatus('')
    setMigrationError('')
    setNeedsAreas(false)
    setAuthBusy(false)
    setAuthStatus('')
    setAuthError('')
    setToast(null)
    setAccountState(ACCOUNT0)
    setUIState(UI0())
    try {
      const fb = fbRef.current
      if (fb) await fb.firebaseSignOut(fb.auth)
    } catch {
      /* keep user returned to sign-in screen even if network is down */
    }
  }, [clearCloudProjectListeners, flushAllPending])

  const signInFromInviteDemo = useCallback(async () => {
    if (inviteToken) setPendingInvite(inviteToken)
    setAccountState(a => ({ ...a, uid: undefined, loggedIn: false, demo: false }))
    await signInWithGoogle()
  }, [inviteToken, signInWithGoogle])

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

  const localProjectCount = cloudActive ? localData.projects.length : 0

  return {
    ...data, data, theme, setTheme, ui, setUI, account, setAccount, isPro, isProFor, isOwner, selfId, personOf, openPro,
    needsAreas, authBusy, authStatus, authError, clearAuthError: () => setAuthError(''),
    pendingMigration, migrating, migrationStatus, migrationError, localProjectCount, migrateLocalData, skipMigration, abortMigration, openLocalMigration,
    inviteToken, inviteState, joinedProjectId, ensureInviteToken, acceptInvite, dismissInvite, retryInvite, signInFromInviteDemo, pickJoinedArea,
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
