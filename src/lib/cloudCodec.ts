import type { DocumentData, FieldValue, QueryDocumentSnapshot, QuerySnapshot, UpdateData } from 'firebase/firestore'
import { AREA_COLORS } from './constants'
import type { Area, Priority, Recurrence, Status, Task } from './types'

export const BATCH_LIMIT = 500

export const VALID_STATUS: Status[] = ['todo', 'in_progress', 'done']
export const VALID_PRIO: Priority[] = ['high', 'med', 'low']
export const VALID_REC: Recurrence[] = ['daily', 'weekly', 'weekdays', 'monthly']
export const VALID_REMS = ['m10', 'm30', 'h1', 'd0', 'd1', 'd3']

export const safeDocId = (raw: string, fallback: string) =>
  raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || fallback

export const authErrMsg = (err: unknown) => {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Masuk dibatalkan.'
  if (code === 'auth/network-request-failed') return 'Tidak bisa terhubung ke Google. Periksa koneksi internet lalu coba lagi.'
  return 'Gagal masuk dengan Google. Coba lagi.'
}

export function docsToAreas(snap: QuerySnapshot): { areas: Area[]; orders: Map<string, number> } {
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
  return {
    areas: rows.map(({ id, name, color }) => ({ id, name, color })),
    orders,
  }
}

export function docToTask(snap: QueryDocumentSnapshot): { task: Task; createdAtMs: number | null } {
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
export function taskToCloudDoc(t: Task, ownerUid: string, pro: boolean, serverTs: () => FieldValue): Record<string, unknown> {
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
export function taskPatchToCloud(patch: Partial<Task>, serverTs: () => FieldValue): UpdateData<DocumentData> | null {
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

export function sortCloudTasks(items: { task: Task; createdAtMs: number | null }[]): Task[] {
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
