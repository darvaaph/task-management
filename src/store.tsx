import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS, FREE_MEMBER_QUOTA, FREE_PROJECT_QUOTA, MEMBER_POOL, PEOPLE, PRO_MEMBER_QUOTA, STATUS } from './lib/constants'
import { addDays, diffDays, fmtDay, today } from './lib/dates'
import { inToday, isOverdue, nextActiveOccurrence, parseDest, type Dest } from './lib/logic'
import { guideTasks, seed } from './lib/seed'
import { feedback } from './lib/feedback'
import type { Activity, Area, Data, ISODate, Priority, Project, Task } from './lib/types'

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

function useStoreValue() {
  const initial = useMemo(load, [])
  const [data, setData] = useState<Data>(initial.data)
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [account, setAccountState] = useState<Account>(initial.account)
  const [ui, setUIState] = useState<UI>(UI0)
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number>(undefined)
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
    // Leaving a real account for the demo loads fresh sample data.
    if (!account.demo) setData(seed())
    setAccountState(a => ({ ...a, loggedIn: true, demo: true, name: 'Anda', onboarding: false }))
    setUIState(UI0())
  }, [account.demo])

  const signIn = useCallback(() => {
    // No backend yet: signing in keeps this browser's data and leaves demo mode.
    setAccountState(a => ({ ...a, loggedIn: true, demo: false }))
    setUIState(UI0())
    say('Berhasil masuk')
  }, [say])

  const register = useCallback((name: string, areaIds: string[] = DEFAULT_AREA_IDS) => {
    const areas = AREA_PRESETS.map((a, i) => ({ ...a, color: AREA_COLORS[i] })).filter(a => areaIds.includes(a.id))
    setData({ tasks: guideTasks(), projects: [], areas, activity: [] })
    setAccountState(a => ({ ...a, loggedIn: true, demo: false, name, plan: 'free', accent: 'indigo', onboarding: true, checkedAreas: false }))
    setUIState(UI0())
    say(`Akun dibuat. Selamat datang, ${name}!`)
  }, [say])

  const signOut = useCallback(() => {
    setAccountState(a => ({ ...a, loggedIn: false }))
    setUIState(UI0())
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

  const go = useCallback((view: View, extra: Partial<UI> = {}) => setUI({ view, taskId: null, overlay: null, ...extra }), [setUI])

  return {
    ...data, data, theme, setTheme, ui, setUI, account, setAccount, isPro, openPro, startDemo, signIn, register, signOut, buyPro, go, toast, setToast, say,
    updateTask, toggleTask, setStatus, deleteTask, clearGuides, moveToToday, moveAllOverdue, moveTask, addTask, createProject, resetDemo, moveDue, updateProject,
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
