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
  rani: { name: 'Rani', i: 'R', c: 'oklch(0.58 0.12 170)' },
  dimas: { name: 'Dimas', i: 'D', c: 'oklch(0.55 0.13 300)' },
  wulan: { name: 'Wulan', i: 'W', c: 'oklch(0.6 0.13 20)' },
  tono: { name: 'Tono', i: 'T', c: 'oklch(0.55 0.1 230)' },
}

/** Sample people used by "Simulasi: teman membuka tautan" in ShareProject. */
export const MEMBER_POOL = ['budi', 'siti', 'rani', 'dimas', 'wulan', 'tono'] as const

export const FREE_PROJECT_QUOTA = 5
export const FREE_MEMBER_QUOTA = 3
export const PRO_MEMBER_QUOTA = 20

/**
 * Area colours: the three defaults, then extra marker colours (markers only, never text).
 * Project colours = AREA_COLORS + 'var(--accent)'; keep in sync with validProjectUpdate
 * (firestore.rules) and VALID_PROJECT_COLORS (functions/index.js).
 */
export const AREA_COLORS = ['var(--area-kuliah)', 'var(--area-kantor)', 'var(--area-pribadi)', 'oklch(0.62 0.14 50)', 'oklch(0.6 0.11 195)', 'oklch(0.6 0.15 0)']

/** Starting areas offered at sign-up. Each keeps the AREA_COLORS entry at its index; the first three are pre-ticked. */
export const AREA_PRESETS = [
  { id: 'kuliah', name: 'Kuliah' },
  { id: 'kantor', name: 'Kantor' },
  { id: 'pribadi', name: 'Pribadi' },
  { id: 'sekolah', name: 'Sekolah' },
  { id: 'usaha', name: 'Usaha' },
  { id: 'organisasi', name: 'Organisasi' },
]
export const DEFAULT_AREA_IDS = AREA_PRESETS.slice(0, 3).map(a => a.id)
