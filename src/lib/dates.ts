import type { ISODate } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const today = (): ISODate => toISO(new Date())
export const addDays = (iso: ISODate, n: number): ISODate => {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export const diffDays = (a: ISODate, b: ISODate) => Math.round((parse(a).getTime() - parse(b).getTime()) / 864e5)

/** 0 = Senin … 6 = Minggu */
export const dow = (iso: ISODate) => (parse(iso).getDay() + 6) % 7

export const fmt = (iso: ISODate | null) => {
  if (!iso) return ''
  const d = parse(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export const fmtLong = (iso: ISODate) => {
  const d = parse(iso)
  return `${DAYS[dow(iso)]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export const fmtDay = (iso: ISODate) => `${DAYS[dow(iso)]}, ${fmt(iso)}`

export const rel = (iso: ISODate | null) => {
  if (!iso) return ''
  const n = diffDays(iso, today())
  if (n === 0) return 'Hari ini'
  if (n === 1) return 'Besok'
  if (n === -1) return 'Kemarin'
  return fmt(iso)
}

export const nextMonday = (): ISODate => {
  const t = today()
  return addDays(t, 7 - dow(t))
}

export const addMinutes = (hhmm: string, m: number) => {
  const [h, mi] = hhmm.split(':').map(Number)
  const t = h * 60 + mi + m
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`
}

export const MONTH_NAMES = MONTHS_LONG
export const DAY_SHORT = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN']
export const DAY_LETTER = ['S', 'S', 'R', 'K', 'J', 'S', 'M']

export const startOfWeek = (iso: ISODate) => addDays(iso, -dow(iso))
export const startOfMonth = (iso: ISODate) => iso.slice(0, 8) + '01'
export const addMonths = (iso: ISODate, n: number) => {
  const d = parse(startOfMonth(iso))
  d.setMonth(d.getMonth() + n)
  return toISO(d)
}
export const monthLabel = (iso: ISODate) => {
  const d = parse(iso)
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}
export const sameMonth = (a: ISODate, b: ISODate) => a.slice(0, 7) === b.slice(0, 7)
export const dayNum = (iso: ISODate) => parse(iso).getDate()
export const monthShort = (iso: ISODate) => MONTHS[parse(iso).getMonth()]
