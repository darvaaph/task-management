export type Priority = 'high' | 'med' | 'low'
export type Status = 'todo' | 'in_progress' | 'done'
export type Recurrence = 'daily' | 'weekly' | 'weekdays' | 'monthly'
/** Date as YYYY-MM-DD in local time. */
export type ISODate = string

export interface Area {
  id: string
  name: string
  color: string
}

export interface Project {
  id: string
  name: string
  area: string | null
  color: string
  start: ISODate
  due: ISODate
  members: string[]
  sections: string[]
  archived: boolean
  /** Custom invite link token created by Reset tautan; falls back to a deterministic token when omitted. */
  inviteToken?: string
}

export interface Task {
  id: string
  title: string
  project: string | null
  area: string | null
  section: string | null
  assignee: string | null
  status: Status
  prio: Priority
  start: ISODate | null
  due: ISODate | null
  time: string | null
  notes: string
  rec: Recurrence | null
  dur: number | null
  /** Reminder keys, e.g. 'm30' or 'd1'. Missing = the default for the task. */
  rems?: string[]
  /** Learn-by-doing task a new account starts with; cleared together by "Hapus semua panduan". */
  guide?: boolean
}

export interface Person {
  name: string
  i: string
  c: string
}

export interface Activity {
  p: string
  text: string
  ts: number
}

export interface Data {
  tasks: Task[]
  projects: Project[]
  areas: Area[]
  activity: Activity[]
}
