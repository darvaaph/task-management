import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS, FREE_MEMBER_QUOTA, FREE_PROJECT_QUOTA, MEMBER_POOL, PEOPLE, PRO_MEMBER_QUOTA, STATUS } from './lib/constants'
import { addDays, diffDays, fmtDay, today } from './lib/dates'
import { auth, db } from './lib/firebase'
import { inToday, isOverdue, nextActiveOccurrence, parseDest, type Dest } from './lib/logic'
import { guideTasks, seed } from './lib/seed'
import { feedback } from './lib/feedback'
import type { Activity, Area, Data, ISODate, Priority, Project, Recurrence, Status, Task } from './lib/types'

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

const ACCOUNT0: Account = { loggedIn: false, demo: false, name: 'Anda', plan: 'free', accent: 'indigo', onboarding: false, checkedAreas: false }

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

function load(): { data: Data; theme: Theme; account: Account } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (s?.data?.tasks) {
      return {
        data: { ...s.data, activity: Array.isArray(s.data.activity) ? s.data.activity : [] },
        theme: s.theme === 'dark' ? 'dark' : 'light',
        account: { ...ACCOUNT0, ...s.account },
      }
    }
  } catch {
    /* storage unavailable or corrupt: start from demo data */
  }
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  return { data: seed(), theme: dark ? 'dark' : 'light', account: ACCOUNT0 }
}

const pushActivity = (list: Activity[], p: string, text: string): Activity[] =>
  [{ p, text, ts: Date.now() }, ...list].slice(0, 200)

const statusActivity = (actor: string, title: string, status: Task['status']) =>
  status === 'done' ? `${actor} menyelesaikan "${title}"` : `${actor} memindah "${title}" ke ${STATUS[status]}`

const VALID_ACCENTS: Accent[] = ['indigo', 'teal', 'tangerine', 'forest']
const VALID_STATUS: Status[] = ['todo', 'in_progress', 'done']
const VALID_PRIO: Priority[] = ['high', 'med', 'low']
const VALID_REC: Recurrence[] = ['daily', 'weekly', 'weekdays', 'monthly']

const authErrMsg = (err: unknown) => {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Masuk dibatalkan.'
  if (code === 'auth/network-request-failed') return 'Tidak bisa terhubung ke Google. Periksa koneksi internet lalu coba lagi.'
  return 'Gagal masuk dengan Google. Coba lagi.'
}

function docToTask(id: string, d: Record<string, unknown>): Task {
  return {
    id,
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
}

function useStoreValue() {
  const initial = useMemo(load, [])
  const [data, setData] = useState<Data>(initial.data)
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [account, setAccountState] = useState<Account>(initial.account)
  const [ui, setUIState] = useState<UI>(UI0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [uid, setUid] = useState<string | null>(null)
  const [needsAreas, setNeedsAreas] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authStatus, setAuthStatus] = useState('')
  const [authError, setAuthError] = useState('')
  const timer = useRef<number>(undefined)
  const handledUid = useRef<string | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const accountRef = useRef(account)
  accountRef.current = account

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = account.accent
    try {
      localStorage.setItem(KEY, JSON.stringify({ data, theme, account }))
    } catch {
      /* private mode: keep working in memory */
    }
  }, [data, theme, account])

  // Keep Mode Demo completely local; only listen to Firebase Auth outside Demo Mode.
  useEffect(() => {
    if (account.demo) return

    let active = true
    let unsubProfile: (() => void) | null = null
    let waitTimer: number | undefined

    const clearProfileWatch = () => {
      unsubProfile?.()
      unsubProfile = null
      window.clearTimeout(waitTimer)
    }

    // Surface errors from signInWithRedirect fallback if returning from a redirect flow.
    getRedirectResult(auth).catch(err => {
      if (!active) return
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError(authErrMsg(err))
    })

    const unsubAuth = onAuthStateChanged(auth, fbUser => {
      if (!active || (accountRef.current.demo && accountRef.current.loggedIn)) return
      clearProfileWatch()

      if (!fbUser) {
        handledUid.current = null
        setUid(null)
        setNeedsAreas(false)
        setAuthBusy(false)
        setAuthStatus('')
        if (accountRef.current.loggedIn && !accountRef.current.demo) {
          setAccountState(a => ({ ...a, loggedIn: false }))
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

      unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        async snap => {
          if (!active || !snap.exists()) return
          window.clearTimeout(waitTimer)
          setAuthError('')

          const p = snap.data()
          const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : (fbUser.displayName?.trim() || 'Anda')
          const plan: 'free' | 'pro' = p.plan === 'pro' ? 'pro' : 'free'
          const accent: Accent = plan === 'pro' && VALID_ACCENTS.includes(p.accent) ? p.accent : 'indigo'

          if (handledUid.current === fbUser.uid) {
            setAccountState(a => ({ ...a, name, plan, accent }))
            return
          }
          handledUid.current = fbUser.uid

          try {
            const areasSnap = await getDocs(collection(db, 'users', fbUser.uid, 'areas'))
            if (!active) return

            if (areasSnap.empty) {
              // First login: collect starting areas before entering the workspace.
              setAccountState(a => ({
                ...a,
                loggedIn: false,
                demo: false,
                name,
                plan,
                accent,
                onboarding: true,
                checkedAreas: false,
              }))
              setNeedsAreas(true)
              setAuthBusy(false)
              setAuthStatus('')
              return
            }

            const tasksSnap = await getDocs(collection(db, 'users', fbUser.uid, 'tasks'))
            if (!active) return

            const areas: Area[] = areasSnap.docs
              .map(d => {
                const x = d.data()
                return {
                  id: d.id,
                  name: typeof x.name === 'string' ? x.name : d.id,
                  color: typeof x.color === 'string' ? x.color : AREA_COLORS[0],
                  order: typeof x.order === 'number' ? x.order : 999,
                }
              })
              .sort((a, b) => a.order - b.order)
              .map(({ id, name: n, color }) => ({ id, name: n, color }))

            const cloudTasks = tasksSnap.docs.map(d => docToTask(d.id, d.data()))
            setData(d => ({
              ...d,
              areas,
              tasks: [...cloudTasks, ...d.tasks.filter(t => t.project != null)],
            }))
            setAccountState(a => ({
              ...a,
              loggedIn: true,
              demo: false,
              name,
              plan,
              accent,
              onboarding: typeof p.onboarding === 'boolean' ? p.onboarding : true,
              checkedAreas: Boolean(p.checkedAreas),
            }))
            setNeedsAreas(false)
            setAuthBusy(false)
            setAuthStatus('')
          } catch {
            if (!active) return
            handledUid.current = null
            setAuthBusy(false)
            setAuthStatus('')
            setAuthError('Gagal memuat data akun. Coba lagi.')
          }
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

    return () => {
      active = false
      clearProfileWatch()
      unsubAuth()
    }
  }, [account.demo])

  const setAccount = useCallback((patch: Partial<Account>) => setAccountState(a => ({ ...a, ...patch })), [])
  const isPro = account.plan === 'pro' || account.demo
  const openPro = useCallback((ctx: ProCtx = 'general') => setUIState(u => ({ ...u, pro: ctx })), [])

  const setUI = useCallback((patch: Partial<UI>) => setUIState(u => ({ ...u, ...patch })), [])

  const say = useCallback((msg: string, undo: (() => void) | null = null) => {
    setToast({ msg, undo })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2600)
  }, [])

  /** Apply a change and show a toast with Urungkan that restores the data exactly as before. */
  const undoable = useCallback((msg: string, mutate: (d: Data) => Data) => {
    const before = dataRef.current
    setData(mutate)
    say(msg, () => {
      setData(before)
      setToast(null)
    })
  }, [say])

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setData(d => {
      const t0 = d.tasks.find(x => x.id === id)
      const activity = t0?.project && patch.status && patch.status !== t0.status
        ? pushActivity(d.activity, t0.project, statusActivity(accountRef.current.name, t0.title, patch.status))
        : d.activity
      return { ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)), activity }
    })
  }, [])

  const toggleTask = useCallback((id: string) => {
    const t = dataRef.current.tasks.find(x => x.id === id)
    if (!t) return
    if (t.status !== 'done') feedback('done', accountRef.current)
    if (t.rec && t.status !== 'done') {
      const n = nextActiveOccurrence(t)
      undoable(`Selesai. Diulang ke ${fmtDay(n)}`, d => ({
        ...d,
        tasks: d.tasks.map(x => (x.id === id ? { ...x, due: n, start: null, status: 'todo' } : x)),
        activity: t.project ? pushActivity(d.activity, t.project, statusActivity(accountRef.current.name, t.title, 'done')) : d.activity,
      }))
      return
    }
    updateTask(id, { status: t.status === 'done' ? 'todo' : 'done' })
  }, [undoable, updateTask])

  const setStatus = useCallback((id: string, status: Task['status'], withUndo = false) => {
    if (status === 'done' && dataRef.current.tasks.find(x => x.id === id)?.status !== 'done') feedback('done', accountRef.current)
    if (withUndo) {
      undoable(`Dipindah ke ${STATUS[status]}`, d => {
        const t0 = d.tasks.find(x => x.id === id)
        const activity = t0?.project && status !== t0.status
          ? pushActivity(d.activity, t0.project, statusActivity(accountRef.current.name, t0.title, status))
          : d.activity
        return { ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, status } : x)), activity }
      })
    } else updateTask(id, { status })
  }, [undoable, updateTask])

  const deleteTask = useCallback((id: string) => {
    setUI({ taskId: null })
    undoable('Tugas dihapus', d => ({ ...d, tasks: d.tasks.filter(x => x.id !== id) }))
  }, [setUI, undoable])

  const clearGuides = useCallback(() => {
    undoable('Tugas panduan dihapus', d => ({ ...d, tasks: d.tasks.filter(t => !t.guide) }))
  }, [undoable])

  const moveToToday = useCallback((id: string) => updateTask(id, { due: today(), start: null }), [updateTask])
  const moveAllOverdue = useCallback(() => {
    const t0 = today()
    const n = dataRef.current.tasks.filter(t => isOverdue(t, t0)).length
    if (!n) return
    undoable(`${n} tugas digeser ke Hari Ini`, d => ({
      ...d,
      tasks: d.tasks.map(t => (isOverdue(t, t0) ? { ...t, due: t0, start: null } : t)),
    }))
  }, [undoable])

  const moveTask = useCallback((t: Task, v: Dest) => {
    const d = parseDest(v)
    const np = d.project ? dataRef.current.projects.find(p => p.id === d.project) : null
    const assignee = np ? (t.assignee && np.members.includes(t.assignee) ? t.assignee : 'me') : null
    updateTask(t.id, { project: d.project, area: d.area, section: d.section, assignee })
  }, [updateTask])

  const addTask = useCallback((input: { title: string; dest: Dest; due: ISODate | null; prio: Priority; pic: string | null }) => {
    const d = parseDest(input.dest)
    const p = d.project ? dataRef.current.projects.find(x => x.id === d.project) : null
    const t: Task = {
      id: 'n' + Date.now(), title: input.title, project: d.project, area: d.area, section: d.section,
      assignee: p ? (input.pic && p.members.includes(input.pic) ? input.pic : 'me') : null,
      status: 'todo', prio: input.prio, start: null, due: input.due, time: null, notes: '', rec: null, dur: null,
    }
    setData(x => ({
      ...x,
      tasks: [t, ...x.tasks],
      activity: d.project ? pushActivity(x.activity, d.project, `${accountRef.current.name} menambahkan "${input.title}"`) : x.activity,
    }))
    return t
  }, [])

  /** Move a task to another day (and optionally time). A task with a start date shifts as a whole. */
  const moveDue = useCallback((id: string, day: ISODate, time?: string | null) => {
    const t = dataRef.current.tasks.find(x => x.id === id)
    if (!t || (t.due === day && (time === undefined || time === t.time))) return
    const patch: Partial<Task> = { due: day, start: t.start && t.due ? addDays(day, -diffDays(t.due, t.start)) : null }
    if (time !== undefined) patch.time = time
    const suffix = patch.time ? ' · ' + patch.time : time === null && t.time ? ' · tanpa jam' : ''
    undoable(`Dipindah ke ${fmtDay(day)}${suffix}`, d => ({ ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, ...patch } : x)) }))
  }, [undoable])

  const updateProject = useCallback((id: string, patch: Partial<Project>) => setData(d => ({ ...d, projects: d.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) })), [])

  /* ----- Kelola proyek: changes save immediately; destructive ones show Urungkan ----- */
  const mapProject = (d: Data, id: string, fn: (p: Project) => Project): Data => ({ ...d, projects: d.projects.map(p => (p.id === id ? fn(p) : p)) })

  const renameSection = useCallback((pid: string, old: string, name: string) => setData(d => ({
    ...mapProject(d, pid, p => ({ ...p, sections: p.sections.map(x => (x === old ? name : x)) })),
    tasks: d.tasks.map(t => (t.project === pid && t.section === old ? { ...t, section: name } : t)),
  })), [])

  const addSection = useCallback((pid: string, name: string) => setData(d => mapProject(d, pid, p => (p.sections.includes(name) ? p : { ...p, sections: [...p.sections, name] }))), [])

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
    setData(d => mapProject(d, p.id, x => ({ ...x, archived: false })))
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
    setData(d => ({
      ...mapProject(d, pid, x => (x.members.includes(nx) ? x : { ...x, members: [...x.members, nx] })),
      activity: pushActivity(d.activity, pid, `${name} bergabung lewat tautan undangan`),
    }))
    say(`${name} bergabung`)
  }, [isPro, say])

  /* ----- Kelola area ----- */
  const updateArea = useCallback((id: string, patch: Partial<Area>) => setData(d => ({
    ...d,
    areas: d.areas.map(a => (a.id === id ? { ...a, ...patch } : a)),
    // A project's colour follows its area.
    projects: patch.color ? d.projects.map(p => (p.area === id ? { ...p, color: patch.color! } : p)) : d.projects,
  })), [])

  const addArea = useCallback((name: string) => setData(d => {
    const used = d.areas.map(a => a.color)
    const color = AREA_COLORS.find(c => !used.includes(c)) ?? AREA_COLORS[d.areas.length % AREA_COLORS.length]
    return { ...d, areas: [...d.areas, { id: 'a' + Date.now(), name, color }] }
  }), [])

  const deleteArea = useCallback((a: Area) => {
    setUIState(u => ({ ...u, inboxArea: 'all', projArea: 'all' }))
    undoable(`Area "${a.name}" dihapus`, d => ({
      ...d,
      areas: d.areas.filter(x => x.id !== a.id),
      tasks: d.tasks.map(t => (t.area === a.id ? { ...t, area: null } : t)),
      projects: d.projects.map(p => (p.area === a.id ? { ...p, area: null } : p)),
    }))
  }, [undoable])

  const createProject = useCallback((name: string, area: string | null, due: ISODate) => {
    const a = dataRef.current.areas.find(x => x.id === area)
    const p: Project = { id: 'p' + Date.now(), name, area, color: a?.color ?? 'var(--accent)', start: today(), due, members: ['me'], sections: [], archived: false }
    setData(d => ({ ...d, projects: [...d.projects, p] }))
    setUI({ view: 'project', projectId: p.id, mode: 'list', taskId: null })
    say(`Proyek "${name}" dibuat`)
  }, [say, setUI])

  /* ----- Akun ----- */
  const startDemo = useCallback(() => {
    // Leaving a real account for the demo loads fresh sample data without touching Firebase.
    if (!account.demo) setData(seed())
    setNeedsAreas(false)
    setAuthError('')
    setAuthBusy(false)
    setAuthStatus('')
    setAccountState(a => ({ ...a, loggedIn: true, demo: true, name: 'Anda', onboarding: false }))
    setUIState(UI0())
  }, [account.demo])

  const signInWithGoogle = useCallback(async () => {
    setAuthError('')
    setAuthBusy(true)
    setAuthStatus('Menghubungkan…')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
      // Fall back to redirect when browser blocks popups.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider)
          return
        } catch (redirErr) {
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
  }, [])

  const completeSetup = useCallback(async (areaIds: string[] = DEFAULT_AREA_IDS) => {
    const curUid = auth.currentUser?.uid ?? uid
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
      const batch = writeBatch(db)
      areas.forEach((a, order) => {
        batch.set(doc(db, 'users', curUid, 'areas', a.id), {
          name: a.name,
          color: a.color,
          order,
        })
      })
      guides.forEach(t => {
        batch.set(doc(db, 'users', curUid, 'tasks', t.id), {
          title: t.title,
          project: null,
          area: t.area,
          section: t.section,
          assignee: t.assignee,
          status: t.status,
          prio: t.prio,
          start: t.start,
          due: t.due,
          time: t.time,
          dur: t.dur,
          rec: t.rec,
          notes: t.notes,
          guide: true,
          createdBy: curUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
      batch.update(doc(db, 'users', curUid), { onboarding: true, checkedAreas: false })
      await batch.commit()

      setData({ tasks: guides, projects: [], areas, activity: [] })
      setAccountState(a => ({ ...a, loggedIn: true, demo: false, onboarding: true, checkedAreas: false }))
      setNeedsAreas(false)
      setAuthBusy(false)
      setAuthStatus('')
      setUIState(UI0())
      say(`Selamat datang, ${accountRef.current.name}!`)
    } catch {
      setAuthBusy(false)
      setAuthStatus('')
      setAuthError('Gagal menyimpan area awal. Coba lagi.')
    }
  }, [say, uid])

  const signOut = useCallback(async () => {
    if (accountRef.current.demo) {
      setAccountState(a => ({ ...a, loggedIn: false, demo: false }))
      setUIState(UI0())
      return
    }
    handledUid.current = null
    setNeedsAreas(false)
    setAuthBusy(false)
    setAuthStatus('')
    setAuthError('')
    setAccountState(ACCOUNT0)
    setUIState(UI0())
    try {
      await firebaseSignOut(auth)
    } catch {
      /* keep user returned to sign-in screen even if network is down */
    }
  }, [])

  const buyPro = useCallback(() => {
    setAccountState(a => ({ ...a, plan: 'pro', demo: false }))
    setUIState(u => ({ ...u, pro: null }))
    say('Pro aktif. Ini simulasi, tidak ada transaksi.')
  }, [say])

  const resetDemo = useCallback(() => {
    setData(seed())
    setUIState(UI0())
    say('Data demo dikembalikan')
  }, [say])

  const markNotified = useCallback((ids: string[]) => setAccountState(a => ({ ...a, notified: [...ids, ...(a.notified ?? [])].slice(0, 300) })), [])

  const go = useCallback((view: View, extra: Partial<UI> = {}) => setUI({ view, taskId: null, overlay: null, ...extra }), [setUI])

  return {
    ...data, data, theme, setTheme, ui, setUI, account, setAccount, isPro, openPro,
    needsAreas, authBusy, authStatus, authError, clearAuthError: () => setAuthError(''),
    startDemo, signInWithGoogle, completeSetup, signOut, buyPro, go, toast, setToast, say,
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
