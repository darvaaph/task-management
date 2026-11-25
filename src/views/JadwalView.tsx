import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from 'react'
import { TaskRow } from '../components/TaskRow'
import { Chip as AreaChip, Segmented } from '../components/ui'
import { PRIO, REC_SHORT } from '../lib/constants'
import {
  DAY_LETTER, DAY_SHORT, DAYS, addDays, addMinutes, addMonths, dayNum, diffDays, dow, fmt, monthLabel, monthShort,
  parse, sameMonth, startOfMonth, startOfWeek, today,
} from '../lib/dates'
import { byOpen, colorOf, hoursOf, virtualOccurrences } from '../lib/logic'
import type { ISODate, Project, Task } from '../lib/types'
import { useStore, type UI } from '../store'
import { ProBadge, ProLocked } from '../components/Pro'
import { useTouch } from '../lib/device'

/* ---------- shared bits ---------- */

/** Id of the task being dragged. Module-level so month cells, week columns and chips share it. */
let dragging: string | null = null

function useDrop() {
  const [over, setOver] = useState<string | null>(null)
  const zone = (key: string, onDrop: (id: string, e: DragEvent<HTMLElement>) => void) => ({
    onDragOver: (e: DragEvent) => { if (!dragging) return; e.preventDefault(); if (over !== key) setOver(key) },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: (e: DragEvent<HTMLElement>) => { e.preventDefault(); const id = dragging; dragging = null; setOver(null); if (id) onDrop(id, e) },
  })
  return { over, zone }
}

const dragProps = (t: Task, enabled: boolean) => enabled
  ? { draggable: true, onDragStart: (e: DragEvent) => { e.stopPropagation(); dragging = t.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id) }, onDragEnd: () => { dragging = null } }
  : { draggable: false }

const navBtn = 'grid h-16 min-w-16 place-items-center rounded-[8px] border border-line2 bg-transparent text-fg'

function CalNav({ label, onPrev, onToday, onNext, unit, big }: { label?: string; onPrev: () => void; onToday: () => void; onNext: () => void; unit: string; big?: boolean }) {
  const h = big ? 'h-18 min-w-18' : ''
  return (
    <div className="flex items-center gap-3">
      {label}
      <button type="button" aria-label={`${unit} sebelumnya`} onClick={onPrev} className={`${navBtn} ${h} text-[16px]`}>‹</button>
      <button type="button" onClick={onToday} className={`${navBtn} ${h} px-6 text-[13px] font-medium`}>Hari ini</button>
      <button type="button" aria-label={`${unit} berikutnya`} onClick={onNext} className={`${navBtn} ${h} text-[16px]`}>›</button>
    </div>
  )
}

function ModeSwitch({ full }: { full?: boolean }) {
  const s = useStore()
  return (
    <Segmented<UI['cal']>
      full={full}
      size={full ? 'lg' : 'md'}
      value={s.ui.cal}
      onChange={cal => s.setUI({ cal })}
      options={[
        { value: 'month', label: 'Bulan' },
        { value: 'week', label: 'Minggu' },
        { value: 'timeline', label: <span className="flex items-center justify-center gap-3">Timeline<ProBadge /></span> },
      ]}
    />
  )
}

type Chip = { key: string; title: string; dot: string; kind: 'task' | 'deadline' | 'virtual'; task?: Task; project?: Project }

function chipsFor(day: ISODate, tasks: Task[], projects: Project[], virt: Record<ISODate, Task[]>, timed?: boolean): Chip[] {
  const list = tasks.filter(t => t.due === day && (timed === undefined || !!t.time === timed)).sort(byOpen)
  return [
    ...(timed ? [] : projects.filter(p => !p.archived && p.due === day).map(p => ({ key: 'p' + p.id, title: 'Tenggat: ' + p.name, dot: p.color, kind: 'deadline' as const, project: p }))),
    ...list.map(t => ({ key: t.id, title: t.title, dot: PRIO[t.prio].c, kind: 'task' as const, task: t })),
    ...(virt[day] || []).filter(t => timed === undefined || !!t.time === timed).map(t => ({ key: 'v' + t.id + day, title: '↻ ' + t.title, dot: PRIO[t.prio].c, kind: 'virtual' as const, task: t })),
  ]
}

function CalChip({ c }: { c: Chip }) {
  const s = useStore()
  const done = c.task?.status === 'done'
  const style =
    c.kind === 'deadline' ? 'border-accent bg-accent-soft text-fg'
      : c.kind === 'virtual' ? 'border-line2 bg-transparent text-fg2 opacity-50'
        : `border-transparent bg-surface2 ${done ? 'text-fg3' : 'text-fg'}`
  return (
    <button
      type="button"
      {...dragProps(c.task!, c.kind === 'task' && !done)}
      onClick={() => (c.project ? s.go('project', { projectId: c.project.id }) : s.setUI({ taskId: c.task!.id }))}
      className={`flex min-w-0 items-center gap-2.5 rounded-xs border px-3 py-1 text-left text-[11.5px] leading-[1.35] ${style}`}
    >
      <span aria-hidden="true" className="size-3 flex-none rounded-full" style={{ background: c.dot }} />
      <span className={`truncate ${done ? 'line-through' : ''}`}>{c.title}</span>
    </button>
  )
}

const dots = (cs: Chip[]) => cs.filter(c => c.kind !== 'task' || c.task!.status !== 'done').slice(0, 3)

function DayDots({ chips }: { chips: Chip[] }) {
  return (
    <span aria-hidden="true" className="flex h-2 gap-1">
      {dots(chips).map(c => <span key={c.key} className="size-2 rounded-full" style={{ background: c.dot }} />)}
    </span>
  )
}

const dayLabel = (d: ISODate) => `${DAYS[dow(d)].toUpperCase()}, ${dayNum(d)} ${monthShort(d).toUpperCase()}`

/* ---------- page ---------- */

export function JadwalView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const { cal, calDay } = s.ui
  const pick = (d: ISODate) => s.setUI({ calDay: d })
  const goMonth = (n: number) => { const m = addMonths(calDay, n); pick(sameMonth(m, today()) ? today() : m) }
  const goWeek = (n: number) => pick(addDays(calDay, 7 * n))

  if (mobile) {
    return (
      <div className="flex flex-col gap-7 px-7 pt-5">
        <div className="flex flex-col gap-6 px-3">
          <div className="flex items-end gap-5">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="flex items-center gap-4">
                <span className="font-mono text-[12px] font-medium text-fg3">{cal === 'timeline' ? 'Semua proyek' : 'Tugas bertanggal & tenggat proyek'}</span>
                {cal === 'timeline' && s.account.demo && <ProBadge label="DEMO PREVIEW" />}
              </span>
              <h1 className="m-0 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]">Jadwal</h1>
            </div>
          </div>
          <ModeSwitch full />
        </div>
        {cal === 'month' && <MonthMobile goMonth={goMonth} />}
        {cal === 'week' && <WeekMobile goWeek={goWeek} />}
        {cal === 'timeline' && (s.isPro ? <div className="-mx-7"><Timeline mobile /></div> : <ProLocked ctx="tl" />)}
      </div>
    )
  }

  const title = cal === 'month' ? monthLabel(calDay) : cal === 'week' ? weekLabel(calDay) : 'Timeline'
  const kicker = cal === 'month' ? 'Jadwal · Bulanan' : cal === 'week' ? 'Jadwal · Mingguan' : 'Jadwal · Semua proyek'
  return (
    <div className="flex h-full min-h-0 flex-col gap-7">
      <div className="flex items-end gap-8">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[12px] font-medium text-fg3">{kicker}</span>
            {cal === 'timeline' && s.account.demo && <ProBadge label="DEMO PREVIEW" />}
          </div>
          <div className="flex items-center gap-7">
            <h1 className={`m-0 font-display text-[30px] leading-[1.05] font-semibold tracking-[-0.02em] ${cal === 'week' ? 'min-w-[330px]' : cal === 'month' ? 'min-w-[240px]' : ''}`}>{title}</h1>
            {cal === 'month' && <CalNav unit="Bulan" onPrev={() => goMonth(-1)} onToday={() => pick(today())} onNext={() => goMonth(1)} />}
            {cal === 'week' && <CalNav unit="Minggu" onPrev={() => goWeek(-1)} onToday={() => pick(today())} onNext={() => goWeek(1)} />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-5">
          <ModeSwitch />
          {cal === 'month' && (
            <div className="flex gap-7 text-[12px] text-fg2">
              {(['high', 'med', 'low'] as const).map(k => (
                <span key={k} className="flex items-center gap-3"><span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: PRIO[k].c }} />{PRIO[k].label}</span>
              ))}
              <span className="flex items-center gap-3"><span aria-hidden="true" className="h-3.5 w-6 rounded-[2px] border border-accent bg-accent-soft" />Tenggat proyek</span>
            </div>
          )}
          {cal === 'week' && <span className="text-[12.5px] text-fg3">Tugas tanpa jam tampil di baris Sepanjang hari</span>}
          {cal === 'timeline' && s.isPro && <span className="text-[12.5px] text-fg3">Geser batang untuk memindah jadwal · tarik ujung kanan untuk mengubah durasi</span>}
        </div>
      </div>
      {cal === 'month' && <MonthGrid />}
      {cal === 'week' && <WeekGrid />}
      {cal === 'timeline' && (s.isPro ? <Timeline /> : <ProLocked ctx="tl" />)}
    </div>
  )
}

const weekLabel = (d: ISODate, short = false) => {
  const a = startOfWeek(d), b = addDays(a, 6)
  const ma = parse(a).getMonth(), mb = parse(b).getMonth()
  const year = short ? '' : ' ' + parse(b).getFullYear()
  if (ma === mb) return `${dayNum(a)}${short ? '–' : ' – '}${dayNum(b)} ${monthLabel(b).split(' ')[0]}${year}`
  return `${dayNum(a)} ${monthShort(a)} – ${dayNum(b)} ${monthShort(b)}${year}`
}

/* ---------- Bulan ---------- */

function monthDays(calDay: ISODate) {
  const first = startOfMonth(calDay)
  const g0 = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(g0, i))
}

function MonthGrid() {
  const s = useStore()
  const { over, zone } = useDrop()
  const days = monthDays(s.ui.calDay)
  const virt = virtualOccurrences(s.tasks, days[0], days[41])
  const t0 = today()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-7 font-mono text-[10.5px] font-semibold tracking-[.06em] text-fg3">
        {DAY_SHORT.map(d => <span key={d} className="px-4">{d}</span>)}
      </div>
      <div className="grid min-h-[480px] flex-1 grid-cols-7 grid-rows-6 overflow-hidden rounded-[12px] border border-line bg-surface">
        {days.map((d, i) => {
          const inM = sameMonth(d, s.ui.calDay)
          const chips = chipsFor(d, s.tasks, s.projects, virt)
          const isT = d === t0
          return (
            <div
              key={d}
              {...zone(d, id => s.moveDue(id, d))}
              className={`flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden p-3 transition-colors ${i % 7 < 6 ? 'border-r border-line' : ''} ${i < 35 ? 'border-b border-line' : ''} ${over === d ? 'bg-accent-soft' : inM ? '' : 'bg-hover'}`}
            >
              <span className={`grid h-11 min-w-11 place-items-center self-start rounded-pill px-2.5 font-mono text-[11.5px] font-semibold ${isT ? 'bg-accent text-on-accent' : inM ? 'text-fg' : 'text-fg3'}`}>{dayNum(d)}</span>
              {chips.slice(0, 3).map(c => <CalChip key={c.key} c={c} />)}
              {chips.length > 3 && <span className="px-3 text-[11px] text-fg3">+{chips.length - 3} lagi</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayList({ day, virt }: { day: ISODate; virt: Task[] }) {
  return virt.length ? (
    <div className="flex flex-col gap-1">
      <div className="text-label px-4 pt-3 pb-2 text-fg3">AKAN BERULANG</div>
      {virt.map(t => <VirtualRow key={t.id} t={t} day={day} />)}
    </div>
  ) : null
}

function VirtualRow({ t, day }: { t: Task; day: ISODate }) {
  const s = useStore()
  return (
    <button type="button" onClick={() => s.setUI({ taskId: t.id })} className="mb-2 flex min-h-24 items-center gap-5 rounded-md border border-dashed border-line2 bg-transparent px-6 py-3 text-left text-fg">
      <span aria-hidden="true" className="size-4 flex-none rounded-full" style={{ background: PRIO[t.prio].c }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px] text-fg2">{t.title}</span>
        <span className="text-[12px] text-fg3">↻ {REC_SHORT[t.rec!]} · {fmt(day)}{t.time ? ' · ' + t.time : ''}</span>
      </span>
    </button>
  )
}

function MonthMobile({ goMonth }: { goMonth: (n: number) => void }) {
  const s = useStore()
  const { calDay } = s.ui
  const days = monthDays(calDay)
  const virt = virtualOccurrences(s.tasks, days[0], days[41])
  const dayTasks = s.tasks.filter(t => t.due === calDay).sort(byOpen)
  const t0 = today()
  return (
    <>
      <div className="rounded-xl border border-line bg-surface px-3 py-5">
        <div className="flex items-center px-3 pb-5">
          <span className="flex-1 pl-3 font-display text-[16px] font-semibold">{monthLabel(calDay)}</span>
          <CalNav big unit="Bulan" onPrev={() => goMonth(-1)} onToday={() => s.setUI({ calDay: t0 })} onNext={() => goMonth(1)} />
        </div>
        <div className="grid grid-cols-7 pb-3 text-center font-mono text-[10px] font-semibold text-fg3">{DAY_LETTER.map((l, i) => <span key={i}>{l}</span>)}</div>
        <div className="grid grid-cols-7">
          {days.map(d => {
            const isT = d === t0, isS = d === calDay, inM = sameMonth(d, calDay)
            return (
              <button key={d} type="button" aria-label={`${DAYS[dow(d)]}, ${fmt(d)}`} aria-pressed={isS} onClick={() => s.setUI({ calDay: d })} className="flex h-23 flex-col items-center gap-2 border-0 bg-transparent py-2">
                <span className={`grid h-13 w-15 place-items-center rounded-[9px] border-[1.5px] text-[13px] font-semibold ${isT ? 'border-transparent bg-accent text-on-accent' : isS ? 'border-fg' : 'border-transparent'} ${!isT && (inM ? 'text-fg' : 'text-fg3')}`}>{dayNum(d)}</span>
                <DayDots chips={chipsFor(d, s.tasks, s.projects, virt)} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="px-4 pb-3 font-mono text-[11px] font-semibold tracking-[.06em] text-fg2">{dayLabel(calDay)}</div>
        {dayTasks.map(t => <TaskRow key={t.id} task={t} compact />)}
        {!dayTasks.length && <div className="px-5 py-7 text-[13px] text-fg3">Tidak ada tugas di hari ini.</div>}
        <DayList day={calDay} virt={virt[calDay] || []} />
      </div>
    </>
  )
}

/* ---------- Minggu ---------- */

const HR0 = 7, HR1 = 23, HH = 48

function WeekGrid() {
  const s = useStore()
  const { over, zone } = useDrop()
  const ws = startOfWeek(s.ui.calDay)
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const virt = virtualOccurrences(s.tasks, week[0], week[6])
  const t0 = today()
  const now = new Date()
  const nowTop = (now.getHours() + now.getMinutes() / 60 - HR0) * HH - 1
  const cols = 'grid grid-cols-[56px_repeat(7,minmax(0,1fr))]'
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-line bg-surface">
      <div className={`${cols} sticky top-0 z-[3] border-b border-line bg-surface`}>
        <span />
        {week.map((d, i) => {
          const isT = d === t0, isS = d === s.ui.calDay
          return (
            <button key={d} type="button" onClick={() => s.setUI({ calDay: d })} className="flex items-center gap-4 border-0 border-l border-line bg-transparent px-5 pt-5 pb-4.5 text-fg">
              <span className={`font-mono text-[10.5px] font-semibold tracking-[.06em] ${isT ? 'text-accent' : 'text-fg3'}`}>{DAY_SHORT[i]}</span>
              <span className={`grid h-13 min-w-13 place-items-center rounded-pill px-3 text-[13px] font-semibold ${isT ? 'bg-accent text-on-accent' : isS ? 'bg-surface2' : ''}`}>{dayNum(d)}</span>
            </button>
          )
        })}
      </div>
      <div className={`${cols} border-b border-line2`}>
        <span className="px-3 py-4 text-right font-mono text-[9.5px] leading-[1.3] font-semibold tracking-[.04em] text-fg3">SEPANJANG HARI</span>
        {week.map((d, i) => (
          <div key={d} {...zone('all:' + d, id => s.moveDue(id, d, null))} className={`flex min-h-22 min-w-0 flex-col gap-1.5 border-l border-line p-3 transition-colors ${over === 'all:' + d ? 'bg-accent-soft' : i >= 5 ? 'bg-hover' : ''}`}>
            {chipsFor(d, s.tasks, s.projects, virt, false).map(c => <CalChip key={c.key} c={c} />)}
          </div>
        ))}
      </div>
      <div className={cols}>
        <div className="flex flex-col">
          {Array.from({ length: HR1 - HR0 }, (_, i) => (
            <span key={i} className="h-24 -translate-y-3 px-4 text-right font-mono text-[10.5px] font-medium text-fg3">{i === 0 ? '' : String(HR0 + i).padStart(2, '0') + ':00'}</span>
          ))}
        </div>
        {week.map((d, i) => {
          const timed = chipsFor(d, s.tasks, s.projects, virt, true).sort((a, b) => a.task!.time!.localeCompare(b.task!.time!))
          return (
            <div
              key={d}
              {...zone('grid:' + d, (id, e) => {
                const r = e.currentTarget.getBoundingClientRect()
                let h = HR0 + (e.clientY - r.top) / HH
                h = Math.max(HR0, Math.min(HR1 - 0.25, Math.round(h * 4) / 4))
                s.moveDue(id, d, `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`)
              })}
              className={`relative border-l border-line transition-colors ${over === 'grid:' + d ? 'bg-accent-soft' : i >= 5 ? 'bg-hover' : ''}`}
              style={{ height: (HR1 - HR0) * HH, backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${HH}px)` }}
            >
              {timed.map(c => {
                const t = c.task!
                const st = Math.max(HR0, Math.min(HR1 - 1, hoursOf(t.time!)))
                const same = timed.filter(x => Math.floor(Math.max(HR0, hoursOf(x.task!.time!))) === Math.floor(st))
                const n = same.length, j = same.indexOf(c)
                const col = colorOf(t, s.projects, s.areas)
                const virtual = c.kind === 'virtual'
                const done = !virtual && t.status === 'done'
                return (
                  <button
                    key={c.key}
                    type="button"
                    {...dragProps(t, !virtual && !done)}
                    onClick={() => s.setUI({ taskId: t.id })}
                    className={`absolute z-[1] flex flex-col gap-0.5 overflow-hidden rounded-[6px] border-0 border-l-[3px] px-3 py-2 text-left ${virtual || done ? 'opacity-50' : ''}`}
                    style={{ top: (st - HR0) * HH + 1, height: Math.max(22, ((t.dur || 60) / 60) * HH - 3), left: `calc(${(j * 100) / n}% + 2px)`, width: `calc(${100 / n}% - 4px)`, borderLeftColor: col, background: `color-mix(in oklch, ${col} 16%, var(--surface))` }}
                  >
                    <span className={`truncate text-[12px] leading-[1.25] font-semibold text-fg ${done ? 'line-through' : ''}`}>{(virtual ? '↻ ' : '') + t.title}</span>
                    <span className="font-mono text-[10.5px] font-medium text-fg2">{t.dur ? `${t.time}–${addMinutes(t.time!, t.dur)}` : t.time}</span>
                  </button>
                )
              })}
              {d === t0 && nowTop > 0 && nowTop < (HR1 - HR0) * HH && (
                <span aria-hidden="true" className="absolute right-0 -left-px z-[2] h-0.5 bg-accent" style={{ top: nowTop }}>
                  <span className="absolute -top-1.5 -left-2 size-4 rounded-full bg-accent" />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekMobile({ goWeek }: { goWeek: (n: number) => void }) {
  const s = useStore()
  const { calDay } = s.ui
  const ws = startOfWeek(calDay)
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const virt = virtualOccurrences(s.tasks, week[0], week[6])
  const t0 = today()
  const dayTasks = s.tasks.filter(t => t.due === calDay)
  const all = dayTasks.filter(t => !t.time).sort(byOpen)
  const timed = dayTasks.filter(t => t.time).sort((a, b) => a.time!.localeCompare(b.time!))
  const head = 'text-label px-4 pb-2 text-fg3'
  return (
    <>
      <div className="rounded-xl border border-line bg-surface px-3 pt-5 pb-4">
        <div className="flex items-center px-3 pb-5">
          <span className="flex-1 pl-3 font-display text-[15px] font-semibold">{weekLabel(calDay, true)}</span>
          <CalNav big unit="Minggu" onPrev={() => goWeek(-1)} onToday={() => s.setUI({ calDay: t0 })} onNext={() => goWeek(1)} />
        </div>
        <div className="grid grid-cols-7">
          {week.map((d, i) => {
            const isT = d === t0, isS = d === calDay
            return (
              <button key={d} type="button" aria-label={`${DAYS[i]}, ${fmt(d)}`} aria-pressed={isS} onClick={() => s.setUI({ calDay: d })} className="flex flex-col items-center gap-2 border-0 bg-transparent py-1">
                <span className={`font-mono text-[10px] font-semibold ${isT ? 'text-accent' : 'text-fg3'}`}>{DAY_LETTER[i]}</span>
                <span className={`grid size-19 place-items-center rounded-[12px] border-[1.5px] text-[15px] font-semibold ${isT ? 'border-transparent bg-accent text-on-accent' : isS ? 'border-fg text-fg' : 'border-transparent text-fg'}`}>{dayNum(d)}</span>
                <DayDots chips={chipsFor(d, s.tasks, s.projects, virt)} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="px-4 font-mono text-[11px] font-semibold tracking-[.06em] text-fg">{dayLabel(calDay)}</div>
      <div className="flex flex-col gap-1">
        <div className={head}>SEPANJANG HARI ({all.length})</div>
        {all.map(t => <TaskRow key={t.id} task={t} compact />)}
        {!all.length && <div className="px-5 py-4 text-[13px] text-fg3">Kosong.</div>}
      </div>
      <div className="flex flex-col gap-1">
        <div className={head}>BERJAM ({timed.length})</div>
        {timed.map(t => (
          <div key={t.id} className="flex items-stretch gap-2">
            <div className="flex w-24 flex-none flex-col items-end gap-2 pt-4.5">
              <span className="font-mono text-[12px] font-semibold text-fg">{t.time}</span>
              <span aria-hidden="true" className="mr-8 w-0.5 flex-1 rounded-[2px] opacity-60" style={{ background: colorOf(t, s.projects, s.areas) }} />
            </div>
            <div className="min-w-0 flex-1"><TaskRow task={t} compact /></div>
          </div>
        ))}
        {!timed.length && <div className="px-5 py-4 text-[13px] text-fg3">Belum ada tugas berjam. Atur jam di detail tugas.</div>}
      </div>
      <DayList day={calDay} virt={virt[calDay] || []} />
    </>
  )
}

/* ---------- Timeline ---------- */

const SPAN = 35

/**
 * Gantt-style view of projects and their dated tasks. Drag a bar to move it, drag its right edge to resize.
 * On phones the bars only move after "Ubah jadwal", so horizontal scrolling never moves a schedule by accident.
 */
export function Timeline({ mobile, projectId }: { mobile?: boolean; projectId?: string }) {
  const s = useStore()
  const [edit, setEdit] = useState(false)
  const [area, setArea] = useState<string>('all')
  const ppd = mobile ? 26 : 34
  const t0 = today()
  const from = addDays(startOfWeek(t0), -14)
  const days = Array.from({ length: SPAN }, (_, i) => addDays(from, i))
  const x = (d: ISODate) => diffDays(d, from) * ppd
  // On touch screens a drag over a bar would fight horizontal scrolling, so bars move only in edit mode.
  const touch = useTouch()
  const canDrag = (!mobile && !touch) || edit
  const scroller = useRef<HTMLDivElement>(null)
  // Open with today in view (about a third from the left).
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, x(t0) - el.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startDrag = (e: RPointerEvent, kind: 'p' | 't', id: string, mode: 'move' | 'resize') => {
    if (!canDrag) return
    e.preventDefault()
    e.stopPropagation()
    const o = kind === 'p' ? s.projects.find(p => p.id === id)! : s.tasks.find(t => t.id === id)!
    const os = o.start ?? o.due!, od = o.due!, x0 = e.clientX
    let last = 0
    const mv = (ev: PointerEvent) => {
      const dd = Math.round((ev.clientX - x0) / ppd)
      if (dd === last) return
      last = dd
      const patch = mode === 'move' ? { start: addDays(os, dd), due: addDays(od, dd) } : { start: os, due: diffDays(addDays(od, dd), os) < 0 ? os : addDays(od, dd) }
      if (kind === 'p') s.updateProject(id, patch)
      else s.updateTask(id, patch)
    }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  type Row = { key: string; label: string; color: string; project: boolean; done: boolean; start: ISODate; due: ISODate; bg: string; border: string; txt: string; kind: 'p' | 't'; id: string; barLabel: string }
  const rows: Row[] = []
  const activeProjects = s.projects.filter(p => !p.archived)
  const hasNoArea = activeProjects.some(p => !p.area)
  const areaChips: [string, string, string][] = [
    ['all', 'Semua', 'var(--fg3)'],
    ...(hasNoArea ? [['none', 'Tanpa area', 'var(--fg3)'] as [string, string, string]] : []),
    ...s.areas.map(a => [a.id, a.name, a.color] as [string, string, string]),
  ]
  const areaFilter = !projectId && (
    <div className={`flex gap-4 ${mobile ? 'no-scrollbar overflow-x-auto px-10 pb-1' : 'flex-wrap'}`}>
      {areaChips.map(([id, label, dot]) => (
        <AreaChip key={id} size={mobile ? 'lg' : 'md'} dot={dot} active={area === id} onClick={() => setArea(id)}>{label}</AreaChip>
      ))}
    </div>
  )
  activeProjects
    .filter(p => (projectId ? p.id === projectId : area === 'all' || (area === 'none' ? !p.area : p.area === area)))
    .forEach(p => {
    rows.push({ key: p.id, label: p.name, color: p.color, project: true, done: false, start: p.start, due: p.due, bg: p.color, border: p.color, txt: '#fff', kind: 'p', id: p.id, barLabel: `${fmt(p.start)} – ${fmt(p.due)}` })
    s.tasks
      .filter(t => t.project === p.id && t.due)
      .sort((a, b) => (a.start ?? a.due!).localeCompare(b.start ?? b.due!))
      .forEach(t => rows.push({
        key: t.id, label: t.title, color: PRIO[t.prio].c, project: false, done: t.status === 'done', start: t.start ?? t.due!, due: t.due!,
        bg: `color-mix(in oklch, ${p.color} 24%, var(--surface))`, border: `color-mix(in oklch, ${p.color} 60%, transparent)`, txt: 'var(--fg)', kind: 't', id: t.id, barLabel: '',
      }))
  })

  const months = days.filter((d, i) => i === 0 || dayNum(d) === 1).map(d => ({ d, label: (dayNum(d) === 1 || d === days[0] ? monthLabel(d) : '').toUpperCase() }))
  const header = mobile ? 46 : 52
  const rowH = mobile ? 52 : 40
  const width = SPAN * ppd

  const grid = (
    <div className="relative flex-none" style={{ width }}>
      <div className="relative border-b border-line" style={{ height: header }}>
        {months.map(m => <span key={m.d} className="absolute top-4 pl-4 font-mono text-[11px] font-semibold tracking-[.04em] whitespace-nowrap text-fg2" style={{ left: x(m.d) }}>{m.label}</span>)}
        {days.map(d => (
          <span key={d} className={`absolute bottom-3.5 text-center font-mono text-[10.5px] ${d === t0 ? 'font-bold text-accent' : 'font-medium text-fg3'}`} style={{ left: x(d), width: ppd }}>{dayNum(d)}</span>
        ))}
      </div>
      {days.map(d => (
        <span key={d} aria-hidden="true" className="absolute bottom-0" style={{ top: header, left: x(d), width: ppd, background: dow(d) >= 5 ? 'var(--hover)' : 'transparent', borderLeft: dow(d) === 0 && !mobile ? '1px solid var(--line)' : undefined }} />
      ))}
      <span aria-hidden="true" className="absolute bottom-0 z-[1] w-0.5 rounded-[2px] bg-accent" style={{ top: header - 8, left: x(t0) + ppd / 2 - 1 }} />
      {rows.map(r => {
        const left = x(r.start)
        const w = (diffDays(r.due, r.start) + 1) * ppd
        const h = mobile ? 22 : r.project ? 22 : 18
        const top = mobile ? 24 : r.project ? 9 : 11
        return (
          <div key={r.key} className="relative border-b border-line" style={{ height: rowH }}>
            {mobile && <span className="absolute top-2.5 z-[2] text-[11.5px] whitespace-nowrap" style={{ left: Math.max(4, left + 2), fontWeight: r.project ? 600 : 400, color: r.project ? 'var(--fg)' : r.done ? 'var(--fg3)' : 'var(--fg2)' }}>{r.label}</span>}
            <div
              onPointerDown={e => startDrag(e, r.kind, r.id, 'move')}
              className="absolute z-[2] flex items-center overflow-hidden rounded-[6px] border px-4 select-none"
              style={{ top, height: h, left, width: w, background: r.bg, borderColor: r.border, opacity: r.done ? 0.45 : 1, cursor: canDrag ? 'grab' : 'default', touchAction: canDrag ? 'none' : 'pan-x pan-y' }}
            >
              {!mobile && <span className="pointer-events-none text-[11px] font-semibold whitespace-nowrap" style={{ color: r.txt }}>{r.barLabel}</span>}
              <span onPointerDown={e => startDrag(e, r.kind, r.id, 'resize')} className="absolute top-0 right-0 bottom-0 w-5" style={{ cursor: canDrag ? 'ew-resize' : 'default', touchAction: canDrag ? 'none' : 'pan-x pan-y' }}>
                <span className="absolute top-[30%] right-1.5 bottom-[30%] w-0.5 rounded-[2px] opacity-50" style={{ background: r.txt }} />
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )

  const editBar = (
    <div className={`flex items-center gap-5 ${mobile ? 'px-10' : ''}`}>
      <span className="flex-1 text-[12.5px] text-fg3">{edit ? 'Mode ubah aktif: geser batang atau tarik ujung kanannya' : 'Geser layar untuk melihat. Ketuk Ubah jadwal untuk memindah batang.'}</span>
      <button type="button" aria-pressed={edit} onClick={() => setEdit(!edit)} className={`h-17 flex-none whitespace-nowrap rounded-pill border px-6.5 text-[13px] font-medium ${edit ? 'border-accent bg-accent text-on-accent' : 'border-line2 bg-transparent text-fg'}`}>{edit ? 'Selesai' : 'Ubah jadwal'}</button>
    </div>
  )

  if (mobile) {
    return (
      <div className="flex flex-col gap-5">
        {areaFilter}
        {editBar}
        {rows.length > 0 ? (
          <div ref={scroller} className="overflow-x-auto border-y border-line bg-surface">{grid}</div>
        ) : (
          <div className="px-10 py-6 text-[13px] text-fg3">Belum ada proyek aktif di area ini.</div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex min-h-0 flex-col gap-5 ${projectId ? '' : 'flex-1'}`}>
      {areaFilter}
      {touch && rows.length > 0 && editBar}
      {rows.length > 0 ? (
        <div ref={scroller} className={`min-h-0 overflow-auto rounded-[12px] border border-line bg-surface ${projectId ? 'max-h-[440px]' : 'flex-1'}`}>
          <div className="flex min-w-max">
            <div className="sticky left-0 z-[3] w-[220px] flex-none border-r border-line bg-surface">
              <div className="border-b border-line" style={{ height: header }} />
              {rows.map(r => (
                <div key={r.key} className="flex items-center gap-4 border-b border-line pr-7" style={{ height: rowH, paddingLeft: r.project ? 14 : 30 }}>
                  <span aria-hidden="true" className="size-3.5 flex-none" style={{ background: r.color, borderRadius: r.project ? '50%' : 2 }} />
                  <span className={`truncate text-[13px] ${r.project ? 'font-semibold text-fg' : r.done ? 'text-fg3' : 'text-fg2'}`}>{r.label}</span>
                </div>
              ))}
            </div>
            {grid}
          </div>
        </div>
      ) : (
        <div className="rounded-[12px] border border-dashed border-line2 px-9 py-11 text-[13.5px] text-fg2">Belum ada proyek aktif di area ini.</div>
      )}
    </div>
  )
}
