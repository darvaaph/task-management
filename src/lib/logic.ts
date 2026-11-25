import { PRANK } from './constants'
import { addDays, diffDays, dow, parse, toISO, today } from './dates'
import type { Area, ISODate, Project, Recurrence, Task } from './types'

export const inToday = (t: Task, t0 = today()) =>
  t.due === t0 || (t.start != null && t.due != null && t.start <= t0 && t.due >= t0)

export const isOverdue = (t: Task, t0 = today()) =>
  t.status !== 'done' && t.due != null && t.due < t0 && !inToday(t, t0)

export const byOpen = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  PRANK[a.prio] - PRANK[b.prio] ||
  (a.time || '99').localeCompare(b.time || '99')

export const nextOccurrence = (d: ISODate, r: Recurrence): ISODate => {
  if (r === 'daily') return addDays(d, 1)
  if (r === 'weekly') return addDays(d, 7)
  if (r === 'weekdays') {
    let n = addDays(d, 1)
    while (dow(n) >= 5) n = addDays(n, 1)
    return n
  }
  const dt = parse(d)
  dt.setMonth(dt.getMonth() + 1)
  return toISO(dt)
}

/** Advance-in-place: next occurrence that is not in the past. */
export const nextActiveOccurrence = (t: Task): ISODate => {
  const t0 = today()
  let n = nextOccurrence(t.due ?? t0, t.rec!)
  while (n < t0) n = nextOccurrence(n, t.rec!)
  return n
}

export const projectProgress = (p: Project, tasks: Task[]) => {
  const pt = tasks.filter(t => t.project === p.id && !t.rec)
  const done = pt.filter(t => t.status === 'done').length
  return { done, total: pt.length, pct: pt.length ? Math.round((done / pt.length) * 100) : 0 }
}

export const daysLeftLabel = (p: Project) => {
  if (p.archived) return 'Diarsipkan'
  const left = diffDays(p.due, today())
  return left < 0 ? 'Lewat tenggat' : left === 0 ? 'Tenggat hari ini' : `${left} hari lagi`
}

export const areaOf = (areas: Area[], id: string | null) =>
  areas.find(a => a.id === id) ?? { id: '', name: 'Tanpa area', color: 'var(--fg3)' }

/** Destination value: 'inbox' | 'area:<id>' | 'proj:<id>' | 'proj:<id>:<section>' */
export type Dest = string

export const parseDest = (v: Dest) => {
  const [kind, a, ...rest] = v.split(':')
  if (kind === 'proj') return { project: a, area: null, section: rest.length ? rest.join(':') : null }
  if (kind === 'area') return { project: null, area: a, section: null }
  return { project: null, area: null, section: null }
}

export const destOfTask = (t: Task): Dest =>
  t.project ? `proj:${t.project}${t.section ? ':' + t.section : ''}` : t.area ? `area:${t.area}` : 'inbox'

export const destInfo = (v: Dest, projects: Project[], areas: Area[]) => {
  const d = parseDest(v)
  if (d.project) {
    const p = projects.find(x => x.id === d.project)
    if (p) return { label: p.name + (d.section ? ' › ' + d.section : ''), color: p.color }
  }
  const a = d.area && areas.find(x => x.id === d.area)
  if (a) return { label: 'Inbox · ' + a.name, color: a.color }
  return { label: 'Inbox', color: 'var(--fg3)' }
}

/** Upcoming occurrences of recurring tasks within [from, to], keyed by date. Read-only projections. */
export const virtualOccurrences = (tasks: Task[], from: ISODate, to: ISODate) => {
  const map: Record<ISODate, Task[]> = {}
  tasks.filter(t => t.rec && t.due && t.status !== 'done').forEach(t => {
    let n = nextOccurrence(t.due!, t.rec!)
    for (let c = 0; n <= to && c < 120; c++, n = nextOccurrence(n, t.rec!)) if (n >= from) (map[n] ||= []).push(t)
  })
  return map
}

export const colorOf = (t: Task, projects: Project[], areas: Area[]) => {
  const p = t.project ? projects.find(x => x.id === t.project) : undefined
  return p ? p.color : t.area ? areaOf(areas, t.area).color : 'var(--fg3)'
}

export const hoursOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h + (m || 0) / 60
}
