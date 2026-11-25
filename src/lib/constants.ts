import type { Person, Priority, Recurrence, Status } from './types'

export const PRIO: Record<Priority, { label: string; c: string; bg: string }> = {
  high: { label: 'Tinggi', c: 'var(--high)', bg: 'var(--high-soft)' },
  med: { label: 'Sedang', c: 'var(--med)', bg: 'var(--med-soft)' },
  low: { label: 'Rendah', c: 'var(--low)', bg: 'var(--low-soft)' },
}
export const PRIO_KEYS: Priority[] = ['high', 'med', 'low']
export const PRANK: Record<Priority, number> = { high: 0, med: 1, low: 2 }

export const STATUS: Record<Status, string> = { todo: 'Belum', in_progress: 'Dikerjakan', done: 'Selesai' }
export const STATUS_KEYS: Status[] = ['todo', 'in_progress', 'done']
export const STATUS_DOT: Record<Status, string> = { todo: 'var(--fg3)', in_progress: 'var(--med)', done: 'var(--area-pribadi)' }

export const REC_SHORT: Record<Recurrence, string> = { daily: 'Harian', weekly: 'Mingguan', weekdays: 'Hari kerja', monthly: 'Bulanan' }

export const PEOPLE: Record<string, Person> = {
  me: { name: 'Anda', i: 'A', c: 'oklch(0.55 0.15 265)' },
  budi: { name: 'Budi', i: 'B', c: 'oklch(0.6 0.13 55)' },
  siti: { name: 'Siti', i: 'S', c: 'oklch(0.58 0.14 340)' },
}

export const FREE_PROJECT_QUOTA = 5

/** Area colours: the three defaults, then extra marker colours (markers only, never text). */
export const AREA_COLORS = ['var(--area-kuliah)', 'var(--area-kantor)', 'var(--area-pribadi)', 'oklch(0.62 0.14 50)', 'oklch(0.6 0.11 195)', 'oklch(0.6 0.15 0)']
