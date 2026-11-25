import { PEOPLE, PRIO, REC_SHORT } from '../lib/constants'
import { addMinutes, rel, today } from '../lib/dates'
import { areaOf, isOverdue } from '../lib/logic'
import type { Task } from '../lib/types'
import { useStore } from '../store'
import { Avatar, PrioBadge } from './ui'

/** One task in a list: check → title + meta → move → date → PIC → priority. */
export function TaskRow({ task: t, compact }: { task: Task; compact?: boolean }) {
  const s = useStore()
  const proj = t.project ? s.projects.find(p => p.id === t.project) : undefined
  const areaId = proj ? proj.area : t.area
  const done = t.status === 'done'
  const od = isOverdue(t)
  const p = PRIO[t.prio]
  const meta = (proj ? proj.name : areaId ? areaOf(s.areas, areaId).name : 'Inbox') + (t.rec ? ' · ↻ ' + REC_SHORT[t.rec] : '')
  const metaColor = proj ? proj.color : areaId ? areaOf(s.areas, areaId).color : 'var(--fg3)'
  const time = t.time ? (t.dur ? `${t.time}–${addMinutes(t.time, t.dur)}` : t.time) : ''
  const showDate = t.due != null && t.due !== today() && !od
  const assignee = proj && t.assignee && proj.members.length > 1 ? PEOPLE[t.assignee] : null
  const selected = s.ui.taskId === t.id

  return (
    <div
      onClick={() => s.setUI({ taskId: t.id })}
      className={`flex min-h-25 w-full min-w-0 cursor-pointer items-center gap-4 overflow-hidden rounded-md py-2.5 pr-5 pl-1 transition-colors hover:bg-hover ${selected ? 'bg-accent-soft' : ''}`}
    >
      <button
        type="button"
        aria-label={done ? `Tandai belum selesai: ${t.title}` : `Tandai selesai: ${t.title}`}
        aria-pressed={done}
        onClick={e => { e.stopPropagation(); s.toggleTask(t.id) }}
        className="grid size-19 flex-none place-items-center border-0 bg-transparent p-0"
      >
        <span
          className="grid size-10 place-items-center rounded-full text-[11px] leading-none font-bold text-bg transition-all"
          style={{ border: `1.6px solid ${done ? 'var(--fg3)' : p.c}`, background: done ? 'var(--fg3)' : 'transparent' }}
        >
          {done ? '✓' : ''}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className={`truncate text-body ${done ? 'text-fg3 line-through' : 'text-fg'}`}>{t.title}</div>
        <div className="flex min-w-0 items-center gap-3 text-meta text-fg3">
          <span aria-hidden="true" className="size-3.5 flex-none rounded-[2px]" style={{ background: metaColor }} />
          <span className="truncate">{meta}</span>
          {time && <span className="flex-none font-mono text-[11px]">{time}</span>}
        </div>
      </div>
      {od && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); s.moveToToday(t.id) }}
          className="flex-none whitespace-nowrap rounded-sm border-0 bg-high-soft px-4 py-3 text-[11.5px] font-semibold text-high"
        >
          {compact ? 'Geser' : `${rel(t.due)} · Geser ke Hari Ini`}
        </button>
      )}
      {showDate && <span className="flex-none whitespace-nowrap text-meta text-fg3">{rel(t.due)}</span>}
      {assignee && <span title={assignee.name}><Avatar i={assignee.i} c={assignee.c} /></span>}
      <PrioBadge prio={t.prio} />
    </div>
  )
}
