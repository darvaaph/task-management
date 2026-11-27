import { useRef, useState } from 'react'
import { InlineComposer } from '../components/Composer'
import { TaskRow } from '../components/TaskRow'
import { Avatar, EmptyCard, PrioBadge, ProgressBar, Segmented } from '../components/ui'
import { STATUS, STATUS_DOT, STATUS_KEYS } from '../lib/constants'
import { fmt, rel } from '../lib/dates'
import { areaOf, byOpen, isOverdue, projectProgress } from '../lib/logic'
import type { Status, Task } from '../lib/types'
import { useStore } from '../store'
import { Timeline } from './JadwalView'
import { ProLocked } from '../components/Pro'

const NEXT: Record<Status, [Status, string]> = { todo: ['in_progress', 'Mulai →'], in_progress: ['done', 'Selesai →'], done: ['todo', '↺ Buka'] }

export function ProjectView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const P = s.projects.find(p => p.id === s.ui.projectId)
  if (!P) return <EmptyCard>Proyek tidak ditemukan.</EmptyCard>
  const pt = s.tasks.filter(t => t.project === P.id)
  const pr = projectProgress(P, s.tasks)
  const area = areaOf(s.areas, P.area)
  const sections = P.sections.length
    ? [...P.sections.map(sc => ({ title: sc, list: pt.filter(t => t.section === sc) })), { title: 'Tanpa bagian', list: pt.filter(t => !t.section || !P.sections.includes(t.section)) }].filter(x => x.list.length)
    : [{ title: 'Semua tugas', list: pt }]
  const mode = s.ui.mode
  const sw = <Segmented full={mobile} size={mobile ? 'lg' : 'md'} value={mode} onChange={m => s.setUI({ mode: m })} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'timeline', label: 'Timeline' }]} />
  const empty = !pt.length && (
    <div className={mobile ? 'px-6' : 'max-w-[780px]'}>
      <EmptyCard>Belum ada tugas di proyek ini. Tambahkan lewat {mobile ? 'tombol +' : 'kolom di atas'}, atau pindahkan tugas dari Inbox lewat Lokasi di detail tugas.</EmptyCard>
    </div>
  )
  const listMode = (
    <div className={`flex flex-col ${mobile ? 'gap-8 px-6' : 'max-w-[780px] gap-11'}`}>
      {pt.length > 0 && sections.map(sc => (
        <section key={sc.title} className="flex flex-col gap-1">
          <div className={`flex items-center gap-4 px-3 pb-4 ${mobile ? '' : 'mb-2 border-b border-line'}`}>
            <h2 className="m-0 font-display text-[14px] font-semibold">{sc.title}</h2>
            <span className="font-mono text-[11px] text-fg3">{sc.list.length}</span>
          </div>
          {[...sc.list].sort(byOpen).map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
        </section>
      ))}
    </div>
  )
  const members = (
    <div className="flex pl-3">
      {P.members.map(m => {
        const person = s.personOf(m, P.id)
        return <span key={m} className="-ml-3"><Avatar i={person.i} c={person.c} size={28} ring="var(--bg)" /></span>
      })}
    </div>
  )
  const owner = s.isOwner(P)
  const canTimeline = s.isProFor(P)
  const archivedBanner = P.archived && (
    <div className="flex max-w-[780px] items-center gap-5 rounded-md bg-surface2 py-5 pr-5 pl-7 text-[13px] text-fg2">
      <span className="flex-1">{owner ? 'Proyek ini diarsipkan dan tidak dihitung dalam kuota.' : 'Proyek ini diarsipkan oleh pemiliknya.'}</span>
      {owner && <button type="button" onClick={() => void s.restoreProject(P)} className="h-16 rounded-[8px] border-0 bg-fg px-6 text-[12.5px] font-semibold text-bg">Kembalikan</button>}
    </div>
  )

  if (mobile) {
    return (
      <div className="flex flex-col gap-8 pt-2">
        <div className="flex flex-col gap-5 px-10">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => s.go('projects')} className="border-0 bg-transparent py-3 text-[15px] font-medium text-accent">‹ Proyek</button>
            <span className="flex-1" />
            <button type="button" onClick={() => s.setUI({ overlay: 'share' })} className="h-18 rounded-pill border border-line2 bg-transparent px-7 text-[13px] font-medium text-fg">Bagikan</button>
            <button type="button" onClick={() => s.setUI({ overlay: 'project' })} className="h-18 rounded-pill border border-line2 bg-transparent px-7 text-[13px] font-medium text-fg">Kelola</button>
          </div>
          {archivedBanner}
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="size-4.5 rounded-[3px]" style={{ background: P.color }} />
            <span className="text-[12.5px] text-fg2">{area.name} · {fmt(P.start)} – {fmt(P.due)}</span>
          </div>
          <h1 className="m-0 font-display text-[28px] leading-[1.05] font-semibold tracking-[-0.02em]">{P.name}</h1>
          <div className="flex items-center gap-5"><ProgressBar pct={pr.pct} color={P.color} /><span className="font-mono text-[12px] font-semibold">{pr.pct}%</span></div>
          {sw}
        </div>
        {empty}
        {mode === 'list' ? listMode : mode === 'board' ? <Board tasks={pt} mobile /> : canTimeline ? <Timeline mobile projectId={P.id} /> : <div className="px-6"><ProLocked ctx="tl" project={P} /></div>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-11">
      <button type="button" onClick={() => s.go('projects')} className="self-start border-0 bg-transparent p-0 text-[13px] font-medium text-fg3">‹ Proyek</button>
      {archivedBanner}
      <div className="flex items-end gap-12">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="size-5 rounded-[3px]" style={{ background: P.color }} />
            <span className="text-[12.5px] text-fg2">{area.name} · {fmt(P.start)} – {fmt(P.due)}</span>
          </div>
          <h1 className="m-0 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]">{P.name}</h1>
          <div className="flex max-w-[420px] items-center gap-6">
            <ProgressBar pct={pr.pct} color={P.color} />
            <span className="font-mono text-[12px] font-semibold">{pr.pct}%</span>
            <span className="text-[12px] text-fg3">{pr.done}/{pr.total} tugas</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {members}
          <button type="button" onClick={() => s.setUI({ overlay: 'share' })} className="ml-4 h-17 rounded-[8px] border border-line2 bg-surface px-7 text-[13px] font-medium text-fg">Bagikan</button>
          <button type="button" onClick={() => s.setUI({ overlay: 'project' })} className="h-17 rounded-[8px] border border-line2 bg-surface px-7 text-[13px] font-medium text-fg">Kelola</button>
          {sw}
        </div>
      </div>
      <div className="max-w-[780px]"><InlineComposer placeholder="Tambah tugas ke proyek ini…" /></div>
      {mode === 'list' && empty}
      {mode === 'list' ? listMode : mode === 'board' ? <Board tasks={pt} /> : canTimeline ? <Timeline projectId={P.id} /> : <ProLocked ctx="tl" project={P} />}
    </div>
  )
}

/** Three fixed columns. Desktop: drag cards between columns. Phone: horizontal scroll + next-status button. */
function Board({ tasks, mobile }: { tasks: Task[]; mobile?: boolean }) {
  const s = useStore()
  const drag = useRef<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)
  return (
    <div className={mobile ? 'flex snap-x snap-mandatory gap-5 overflow-x-auto px-8 pb-4' : 'grid grid-cols-3 items-start gap-7'}>
      {STATUS_KEYS.map(st => {
        const list = tasks.filter(t => t.status === st).sort(byOpen)
        const hot = over === st
        return (
          <section
            key={st}
            aria-label={STATUS[st]}
            onDragOver={e => { if (!drag.current) return; e.preventDefault(); setOver(st) }}
            onDragLeave={() => setOver(o => (o === st ? null : o))}
            onDrop={e => {
              e.preventDefault()
              const id = drag.current
              drag.current = null
              setOver(null)
              const t = id && s.tasks.find(x => x.id === id)
              if (t && t.status !== st) s.setStatus(t.id, st, true)
            }}
            className={`flex flex-col gap-4 p-6 transition-colors ${mobile ? 'w-[280px] flex-none snap-start rounded-xl' : 'min-h-[200px] rounded-lg'} ${hot ? 'bg-accent-soft outline-2 -outline-offset-2 outline-accent outline-dashed' : 'bg-surface2'}`}
          >
            <div className="flex items-center gap-4 px-2 pt-1 pb-3">
              <span aria-hidden="true" className="size-4 rounded-full" style={{ background: STATUS_DOT[st] }} />
              <h2 className="m-0 text-[13px] font-semibold">{STATUS[st]}</h2>
              <span className="font-mono text-[11px] text-fg3">{list.length}</span>
            </div>
            {list.map(t => <BoardCard key={t.id} t={t} mobile={mobile} onDragStart={() => (drag.current = t.id)} onDragEnd={() => { drag.current = null; setOver(null) }} />)}
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({ t, mobile, onDragStart, onDragEnd }: { t: Task; mobile?: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const s = useStore()
  const done = t.status === 'done'
  const od = isOverdue(t)
  const [next, label] = NEXT[t.status]
  const proj = s.projects.find(p => p.id === t.project)
  const who = proj && proj.members.length > 1 && t.assignee ? s.personOf(t.assignee, proj.id) : null
  return (
    <div
      draggable={!mobile}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={() => s.setUI({ taskId: t.id })}
      className={`flex cursor-pointer flex-col gap-5 border-line bg-surface p-6 ${mobile ? 'rounded-[12px]' : 'rounded-md border shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:border-line2'}`}
    >
      <div className={`leading-[1.35] ${mobile ? 'text-[14px]' : 'text-[13.5px]'} ${done ? 'text-fg3 line-through' : 'text-fg'}`}>{t.title}</div>
      <div className="flex items-center gap-3">
        <PrioBadge prio={t.prio} small />
        <span className={`text-[11.5px] ${od ? 'text-high' : 'text-fg3'}`}>{t.due ? rel(t.due) : 'Tanpa tanggal'}</span>
        <span className="flex-1" />
        {who && !mobile && <Avatar i={who.i} c={who.c} size={20} />}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); s.setStatus(t.id, next) }}
          className={`rounded-[6px] border border-line2 bg-transparent font-medium text-fg2 ${mobile ? 'h-16 rounded-[8px] px-5 text-[12px]' : 'px-3.5 py-2 text-[11px]'}`}
        >
          {label}
        </button>
      </div>
    </div>
  )
}
