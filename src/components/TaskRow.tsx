import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { PRIO, REC_SHORT } from '../lib/constants'
import { addDays, addMinutes, nextMonday, rel, today } from '../lib/dates'
import { useMedia, useTouch } from '../lib/device'
import { feedback } from '../lib/feedback'
import { areaOf, isOverdue } from '../lib/logic'
import type { Task } from '../lib/types'
import { useStore } from '../store'
import { Avatar, Chip, DateChip, Modal, PrioBadge, Sheet } from './ui'

/** Pixels at the left screen edge left alone, so iOS "swipe back" still works. */
const EDGE = 20
/** Share of the row width a swipe must pass to act. */
const ARM = 0.35

/** Horizontal swipe on a touch screen. Vertical moves are left to the page so lists still scroll. */
function useSwipe(enabled: boolean, onRight: () => void, onLeft: () => void) {
  const [dx, setDx] = useState(0)
  const [live, setLive] = useState(false)
  const g = useRef<{ x: number; y: number; id: number; mode: '?' | 'x' | 'no'; w: number; dx: number } | null>(null)
  // A swipe ends with a click on the row; swallow it so the detail doesn't open.
  const swiped = useRef(false)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    swiped.current = false
    if (!enabled || e.pointerType === 'mouse' || e.clientX < EDGE) return
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: '?', w: e.currentTarget.offsetWidth, dx: 0 }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const st = g.current
    if (!st || st.id !== e.pointerId || st.mode === 'no') return
    const mx = e.clientX - st.x, my = e.clientY - st.y
    if (st.mode === '?') {
      if (Math.abs(my) > 10) { st.mode = 'no'; return }
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.5) return
      st.mode = 'x'
      // Capture can fail if the pointer is already gone; the swipe still works without it.
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      setLive(true)
    }
    st.dx = Math.max(-st.w, Math.min(st.w, mx))
    setDx(st.dx)
  }
  const end = (cancel: boolean) => {
    const st = g.current
    g.current = null
    if (!st || st.mode !== 'x') return
    swiped.current = true
    setLive(false)
    setDx(0)
    if (cancel || Math.abs(st.dx) < st.w * ARM) return
    if (st.dx > 0) onRight()
    else onLeft()
  }
  const w = g.current?.w ?? 1
  return {
    dx, live, armed: Math.abs(dx) >= w * ARM,
    handlers: enabled ? {
      onPointerDown, onPointerMove,
      onPointerUp: () => end(false),
      onPointerCancel: () => end(true),
      onClickCapture: (e: React.MouseEvent) => { if (swiped.current) { swiped.current = false; e.stopPropagation(); e.preventDefault() } },
    } : {},
  }
}

/** Pick a new due date after a left swipe. */
function ScheduleDialog({ task: t, onClose }: { task: Task; onClose: () => void }) {
  const s = useStore()
  const phone = useMedia('(max-width: 767px)')
  const pick = (day: string) => { s.moveDue(t.id, day); onClose() }
  const opts: [string, string][] = [['Hari ini', today()], ['Besok', addDays(today(), 1)], ['Senin depan', nextMonday()]]
  const body = (
    <>
      <span className="text-label text-fg3">JADWALKAN</span>
      <div className="truncate text-body font-medium text-fg">{t.title}</div>
      <div className="flex flex-wrap gap-3">
        {opts.map(([l, v]) => <Chip key={l} size="lg" active={t.due === v} onClick={() => pick(v)}>{l}</Chip>)}
        <DateChip size="lg" value={t.due} custom={t.due != null && !opts.some(([, v]) => v === t.due)} onChange={v => v && pick(v)} />
      </div>
    </>
  )
  return createPortal(phone ? <Sheet onClose={onClose} label="Jadwalkan tugas">{body}</Sheet> : <Modal onClose={onClose} label="Jadwalkan tugas" width={380}>{body}</Modal>, document.body)
}

/** One task in a list: check → title + meta → move → date → PIC → priority. On touch screens it also swipes. */
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
  const assignee = proj && t.assignee && proj.members.length > 1 ? s.personOf(t.assignee, proj.id) : null
  const selected = s.ui.taskId === t.id
  // Narrow rows keep the badge only for Tinggi; Sedang/Rendah move to the meta line so the title gets the room.
  const quietPrio = Boolean(compact) && t.prio !== 'high'
  // Pops only when the user ticks it, not when an already-done row mounts.
  const [pop, setPop] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const toggle = () => { if (!done) setPop(true); s.toggleTask(t.id) }
  const sw = useSwipe(useTouch(), toggle, () => setScheduling(true))
  const prefs = s.account
  useEffect(() => { if (sw.armed) feedback('arm', prefs) }, [sw.armed]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="relative w-full min-w-0 overflow-hidden rounded-md">
        {sw.dx !== 0 && (
          <div
            aria-hidden="true"
            className={`absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap px-8 text-[13px] font-semibold transition-opacity ${sw.dx > 0 ? 'left-0 justify-start bg-low-soft text-low' : 'right-0 justify-end bg-accent-soft text-accent'} ${sw.armed ? 'opacity-100' : 'opacity-60'}`}
            style={{ width: Math.abs(sw.dx) }}
          >
            {sw.dx > 0 ? (done ? 'Belum selesai' : 'Selesai') : 'Jadwalkan'}
          </div>
        )}
        <div
          {...sw.handlers}
          onClick={() => s.setUI({ taskId: t.id })}
          className={`relative flex min-h-25 w-full min-w-0 cursor-pointer items-center gap-4 overflow-hidden rounded-md py-2.5 pr-5 pl-1 transition-colors hover:bg-hover ${selected ? 'bg-accent-soft' : ''}`}
          style={{
            transform: sw.dx ? `translateX(${sw.dx}px)` : undefined,
            transition: sw.live ? 'none' : 'transform var(--dur-base) var(--ease-standard), background-color var(--dur-fast)',
            touchAction: 'pan-y',
          }}
        >
          <button
            type="button"
            aria-label={done ? `Tandai belum selesai: ${t.title}` : `Tandai selesai: ${t.title}`}
            aria-pressed={done}
            onClick={e => { e.stopPropagation(); toggle() }}
            className="grid size-19 flex-none place-items-center border-0 bg-transparent p-0"
          >
            <span
              onAnimationEnd={() => setPop(false)}
              className={`grid size-10 place-items-center rounded-full text-[11px] leading-none font-bold text-bg transition-colors duration-(--dur-fast) ${pop ? 'animate-pop' : ''}`}
              style={{ border: `1.6px solid ${done ? 'var(--fg3)' : p.c}`, background: done ? 'var(--fg3)' : 'transparent' }}
            >
              {done ? '✓' : ''}
            </span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className={`truncate text-body transition-colors duration-(--dur-base) ${done ? 'text-fg3 line-through' : 'text-fg'}`}>{t.title}</div>
            <div className="flex min-w-0 items-center gap-3 text-meta text-fg3">
              <span aria-hidden="true" className="size-3.5 flex-none rounded-[2px]" style={{ background: metaColor }} />
              <span className="truncate">{meta}</span>
              {time && <span className="flex-none font-mono text-[11px]">{time}</span>}
              {quietPrio && <span className="flex-none">· {p.label}</span>}
            </div>
          </div>
          {od && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); s.moveToToday(t.id) }}
              className="flex-none whitespace-nowrap rounded-sm border-0 bg-high-soft px-4 py-3 text-[11.5px] font-semibold text-high max-md:h-18 max-md:px-5"
            >
              {compact ? 'Geser' : `${rel(t.due)} · Geser ke Hari Ini`}
            </button>
          )}
          {showDate && <span className="flex-none whitespace-nowrap text-meta text-fg3">{rel(t.due)}</span>}
          {assignee && <span title={assignee.name}><Avatar i={assignee.i} c={assignee.c} /></span>}
          {!quietPrio && <PrioBadge prio={t.prio} />}
        </div>
      </div>
      {scheduling && <ScheduleDialog task={t} onClose={() => setScheduling(false)} />}
    </>
  )
}
