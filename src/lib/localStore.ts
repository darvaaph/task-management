import { today } from './dates'
import { seed } from './seed'
import type { Area, Data, ISODate, Project, Task } from './types'

export const STORAGE_KEY = 'taskflow-v1'
const REDIRECT_FLAG = 'taskflow-auth-redirect'
const INVITE_FLAG = 'taskflow-pending-invite'

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
  /** Desktop sidebar shrunk to icons. Unset = automatic: icons below 1100 px (tablets), full on laptops. */
  sidebar?: boolean
  /** Reminders already shown, as "task:due:key", so a reload never shows one twice. */
  notified?: string[]
}

export interface LocalMigration {
  areas: Area[]
  tasks: Task[]
  projects: Project[]
  projectTasks: Task[]
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

export interface StoredState {
  data?: Data
  byUid?: Record<string, Data>
  theme?: Theme
  account?: Partial<Account>
  seeded?: boolean
  migrated?: boolean
  /** Unmigrated pre-cloud local data, stashed when Mode Demo replaced the root slot with sample data. */
  legacy?: Data
}

export const ACCOUNT0: Account = {
  loggedIn: false,
  demo: false,
  name: 'Kamu',
  plan: 'free',
  accent: 'indigo',
  onboarding: false,
  checkedAreas: false,
}

export const EMPTY_DATA: Data = { tasks: [], projects: [], areas: [], activity: [] }

export const UI0 = (): UI => ({
  view: 'today',
  projectId: null,
  mode: 'list',
  taskId: null,
  inboxArea: 'all',
  projArea: 'all',
  archives: false,
  banner: true,
  cal: 'month',
  calDay: today(),
  overlay: null,
  pro: null,
})

export const hasRedirectFlag = () => {
  try {
    return sessionStorage.getItem(REDIRECT_FLAG) === '1'
  } catch {
    return false
  }
}

export const setRedirectFlag = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(REDIRECT_FLAG, '1')
    else sessionStorage.removeItem(REDIRECT_FLAG)
  } catch {
    /* ignore private mode */
  }
}

export const parseInvitePath = (pathname = typeof location !== 'undefined' ? location.pathname : '/'): string | null => {
  const m = pathname.match(/^\/invite\/([^/]+)\/?$/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).trim() || null
  } catch {
    return m[1].trim() || null
  }
}

export const getPendingInvite = (): string | null => {
  try {
    return sessionStorage.getItem(INVITE_FLAG) || null
  } catch {
    return null
  }
}

export const setPendingInvite = (token: string | null) => {
  try {
    if (token) sessionStorage.setItem(INVITE_FLAG, token)
    else sessionStorage.removeItem(INVITE_FLAG)
  } catch {
    /* ignore private mode */
  }
}

export const clearInviteUrl = () => {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  if (location.pathname.startsWith('/invite/')) {
    history.replaceState(null, '', '/')
  }
}

/** The demo has no button on the sign-in screen; it opens only from the /demo link. Consumes the path once. */
export const takeDemoPath = (): boolean => {
  if (typeof location === 'undefined' || typeof history === 'undefined') return false
  if (!/^\/demo\/?$/.test(location.pathname)) return false
  history.replaceState(null, '', '/')
  return true
}

/** Static privacy policy route, matched like /invite so it works both before and after sign-in. */
export const isPrivacyPath = (pathname = typeof location !== 'undefined' ? location.pathname : '/'): boolean =>
  /^\/privasi\/?$/.test(pathname)

/** Heuristic for pre-1E browsers that stored untouched seed() data before loggedIn was ever true. */
export function isUntouchedSeed(saved: StoredState): boolean {
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

export function normalizeData(d?: Partial<Data>): Data {
  return {
    tasks: Array.isArray(d?.tasks) ? d.tasks : [],
    projects: Array.isArray(d?.projects) ? d.projects : [],
    areas: Array.isArray(d?.areas) ? d.areas : [],
    activity: Array.isArray(d?.activity) ? d.activity : [],
  }
}

export function normalizeByUid(raw: unknown): Record<string, Data> {
  const byUid: Record<string, Data> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) byUid[k] = normalizeData(v as Partial<Data>)
  }
  return byUid
}

export function extractMigration(saved: StoredState): LocalMigration | null {
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
  const projects = Array.isArray(src.projects)
    ? src.projects.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
    : []
  const projIds = new Set(projects.map(p => p.id))
  const allTasks = Array.isArray(src.tasks) ? src.tasks : []
  const tasks = allTasks.filter(t => t && typeof t.id === 'string' && !t.project && !t.guide && typeof t.title === 'string' && t.title.trim())
  const projectTasks = allTasks.filter(t => t && typeof t.id === 'string' && t.project && projIds.has(t.project) && typeof t.title === 'string' && t.title.trim())
  if (!areas.length && !tasks.length && !projects.length) return null
  return { areas, tasks, projects, projectTasks }
}

/** Combine unmigrated pre-login local data with any per-uid Phase-1 local projects still on this device. */
export function buildUserMigration(legacyBackup: LocalMigration | null, userLocal: Data | undefined): LocalMigration | null {
  const areaMap = new Map<string, Area>()
  for (const a of legacyBackup?.areas ?? []) areaMap.set(a.id, a)
  const looseMap = new Map<string, Task>()
  for (const t of legacyBackup?.tasks ?? []) looseMap.set(t.id, t)

  const projMap = new Map<string, Project>()
  for (const p of userLocal?.projects ?? []) {
    if (p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim()) projMap.set(p.id, p)
  }
  for (const p of legacyBackup?.projects ?? []) {
    if (p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() && !projMap.has(p.id)) {
      projMap.set(p.id, p)
    }
  }
  const projIds = new Set(projMap.keys())
  const ptMap = new Map<string, Task>()
  for (const t of userLocal?.tasks ?? []) {
    if (t && typeof t.id === 'string' && t.project && projIds.has(t.project) && typeof t.title === 'string' && t.title.trim()) {
      ptMap.set(t.id, t)
    }
  }
  for (const t of legacyBackup?.projectTasks ?? []) {
    if (t && typeof t.id === 'string' && t.project && projIds.has(t.project) && typeof t.title === 'string' && t.title.trim() && !ptMap.has(t.id)) {
      ptMap.set(t.id, t)
    }
  }

  const areas = [...areaMap.values()]
  const tasks = [...looseMap.values()]
  const projects = [...projMap.values()]
  const projectTasks = [...ptMap.values()]
  if (!areas.length && !tasks.length && !projects.length) return null
  return { areas, tasks, projects, projectTasks }
}

export function loadLocalStore(): {
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
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredState | null
    if (s?.data?.tasks) {
      const rootData = normalizeData(s.data)
      const account: Account = { ...ACCOUNT0, ...s.account }
      // Earlier builds saved the formal default name; Google accounts keep whatever name they have.
      if (account.name === 'Anda' && !account.uid) account.name = ACCOUNT0.name
      const byUid = s.byUid && typeof s.byUid === 'object'
        ? normalizeByUid(s.byUid)
        : account.uid && !account.demo
          // Lift pre-P1 single-slot local projects into this user's per-uid bucket.
          ? { [account.uid]: rootData }
          : {}
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
  return {
    data: demoSeed,
    rootData: demoSeed,
    byUid: {},
    theme: dark ? 'dark' : 'light',
    account: ACCOUNT0,
    seeded: true,
    migrated: false,
    legacy: null,
    migration: null,
  }
}

export function saveLocalStore(state: {
  rootData: Data
  byUid: Record<string, Data>
  theme: Theme
  account: Account
  seeded: boolean
  migrated: boolean
  legacy: Data | null
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      data: state.rootData,
      byUid: state.byUid,
      theme: state.theme,
      account: state.account,
      ...(state.seeded ? { seeded: true } : {}),
      ...(state.migrated ? { migrated: true } : {}),
      ...(state.legacy ? { legacy: state.legacy } : {}),
    }))
  } catch {
    /* private mode: keep working in memory */
  }
}
