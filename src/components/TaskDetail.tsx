import { useState, type ReactNode } from 'react'
import { PEOPLE, PRIO, STATUS, STATUS_KEYS } from '../lib/constants'
import { addDays, diffDays, fmtDay, nextMonday, today } from '../lib/dates'
import { destOfTask } from '../lib/logic'
import type { Recurrence, Task } from '../lib/types'
import { ProBadge } from './Pro'
import { useStore } from '../store'
import { DestButton, DestList } from './DestPicker'
import { Avatar, Chip, PrioPicker, Sheet, useEscape } from './ui'

const input = 'rounded-[8px] border border-line2 bg-bg px-4 text-[13px] font-medium text-fg'

function useDetail(t: Task) {
  const s = useStore()
  const [picking, setPicking] = useState(false)
  const proj = t.project ? s.projects.find(p => p.id === t.project) : undefined
  const upd = (patch: Partial<Task>) => s.updateTask(t.id, patch)
  const setDue = (d: string | null) => upd({ due: d, start: d == null || (t.start != null && t.start > d) ? null : t.start })
  const shift = (n: number) => setDue(addDays(t.due ?? today(), t.due ? n : 0))
  const close = () => s.setUI({ taskId: null })
  return { s, t, proj, upd, setDue, shift, close, picking, setPicking, done: t.status === 'done' }
}

function CheckButton({ t, size }: { t: Task; size: number }) {
  const s = useStore()
  const done = t.status === 'done'
  return (
    <button
      type="button"
      aria-label={done ? 'Tandai belum selesai' : 'Tandai selesai'}
      aria-pressed={done}
      onClick={() => s.toggleTask(t.id)}
      className="mt-2.5 grid flex-none place-items-center rounded-full p-0 text-[12px] font-bold text-bg"
      style={{ width: size, height: size, border: `1.6px solid ${done ? 'var(--fg3)' : PRIO[t.prio].c}`, background: done ? 'var(--fg3)' : 'transparent' }}
    >
      {done ? '✓' : ''}
    </button>
  )
}

function StatusPicker({ t, big }: { t: Task; big?: boolean }) {
  const s = useStore()
  return (
    <div className={big ? 'grid grid-cols-3 gap-3' : 'flex flex-wrap gap-2'}>
      {STATUS_KEYS.map(k => {
        const on = t.status === k
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => s.setStatus(t.id, k)}
            className={`border font-medium ${big ? 'h-20 rounded-md text-[13px]' : 'rounded-sm px-4.5 py-2.5 text-[12px]'} ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line2 bg-transparent text-fg2'}`}
          >
            {STATUS[k]}
          </button>
        )
      })}
    </div>
  )
}

function DueChips({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  const opts: [string, string | null][] = [['Hari ini', today()], ['Besok', addDays(today(), 1)], ['Senin depan', nextMonday()], ['Tanpa tanggal', null]]
  return (
    <div className="flex flex-wrap gap-2.5">
      {opts.map(([l, v]) => <Chip key={l} size={big ? 'lg' : 'sm'} active={d.t.due === v} onClick={() => d.setDue(v)}>{l}</Chip>)}
      <input type="date" value={d.t.due ?? ''} onChange={e => d.setDue(e.target.value || null)} aria-label="Pilih tanggal" className={`${input} ${big ? 'h-18' : 'h-14'}`} />
    </div>
  )
}

function Pics({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  if (!d.proj || d.proj.members.length < 2) return null
  return (
    <div className="flex flex-wrap gap-3">
      {d.proj.members.map(k => {
        const p = PEOPLE[k]
        const on = d.t.assignee === k
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => d.upd({ assignee: k })} className={`flex items-center gap-3 rounded-pill border pr-4.5 pl-1.5 font-medium text-fg ${big ? 'h-19 text-[13px]' : 'py-1.5 text-[12px]'} ${on ? 'border-accent bg-accent-soft' : 'border-line2 bg-transparent'}`}>
            <Avatar i={p.i} c={p.c} size={big ? 28 : 20} />{p.name}
          </button>
        )
      })}
    </div>
  )
}

function Location({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  const cur = destOfTask(d.t)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DestButton tall={big} value={cur} open={d.picking} onToggle={() => d.setPicking(!d.picking)} />
      {d.picking && <DestList tall={big} value={cur} onPick={v => { d.s.moveTask(d.t, v); d.setPicking(false) }} />}
    </div>
  )
}

const startHint = (t: Task) => (t.start && t.due ? `${diffDays(t.due, t.start) + 1} hari` : 'Opsional, untuk tugas beberapa hari')

const DURS: [number | null, string][] = [[null, 'Tanpa'], [15, '15 mnt'], [30, '30 mnt'], [60, '1 jam'], [120, '2 jam'], [180, '3 jam']]
const RECS: [Recurrence | null, string, boolean][] = [[null, 'Tidak', false], ['daily', 'Harian', false], ['weekly', 'Mingguan', false], ['weekdays', 'Hari kerja', true], ['monthly', 'Bulanan', true]]
const REM_TIMED: [string, string][] = [['m10', '10 mnt sebelum'], ['m30', '30 mnt sebelum'], ['h1', '1 jam sebelum'], ['d1', 'H-1, 09:00']]
const REM_DAY: [string, string][] = [['d0', 'Hari H, 09:00'], ['d1', 'H-1, 09:00'], ['d3', 'H-3, 09:00']]
export const remindersOf = (t: Task) => t.rems ?? (t.due == null ? [] : [t.time ? 'm30' : 'd0'])

/** A chip that, when locked, shows PRO and opens the Pro screen instead. */
function LockChip({ active, locked, onClick, children, big }: { active: boolean; locked?: boolean; onClick: () => void; children: ReactNode; big?: boolean }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`flex items-center gap-2.5 whitespace-nowrap rounded-pill border px-5.5 text-[12.5px] font-medium ${big ? 'h-17' : 'h-14'} ${active ? 'border-fg bg-fg text-bg' : 'border-line2 bg-transparent text-fg2'}`}>
      {children}{locked && <ProBadge />}
    </button>
  )
}

function Duration({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {DURS.map(([v, l]) => {
        const locked = !d.s.isPro && v != null
        return <LockChip key={l} big={big} active={(d.t.dur ?? null) === v} locked={locked} onClick={() => (locked ? d.s.openPro('dur') : d.upd({ dur: v }))}>{l}</LockChip>
      })}
    </div>
  )
}

function Repeat({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {RECS.map(([v, l, pro]) => {
        const locked = pro && !d.s.isPro
        // Turning repeat on for an undated task dates it today.
        return <LockChip key={l} big={big} active={(d.t.rec ?? null) === v} locked={locked} onClick={() => (locked ? d.s.openPro('rec') : d.upd({ rec: v, due: v && !d.t.due ? today() : d.t.due }))}>{l}</LockChip>
      })}
    </div>
  )
}

/** Free: one reminder (picking another replaces it). Pro: several. */
function Reminders({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  if (!d.t.due) return <span className="text-[13px] text-fg3">Atur tanggal dulu untuk memasang pengingat.</span>
  const cur = remindersOf(d.t)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {(d.t.time ? REM_TIMED : REM_DAY).map(([k, l]) => {
          const on = cur.includes(k)
          return <LockChip key={k} big={big} active={on} onClick={() => d.upd({ rems: on ? cur.filter(x => x !== k) : d.s.isPro ? [...cur, k] : [k] })}>{l}</LockChip>
        })}
      </div>
      <p className="m-0 text-[12px] leading-normal text-fg3">
        {d.s.isPro ? 'Bisa pilih lebih dari satu.' : <>Gratis: 1 pengingat per tugas. Lebih dari satu di <button type="button" onClick={() => d.s.openPro('rem')} aria-label="Lihat TaskFlow Pro" className="inline-flex border-0 bg-transparent p-0 align-middle"><ProBadge /></button></>}
      </p>
    </div>
  )
}

function Row({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <>
      <span className={`text-fg3 ${top ? 'self-start pt-3' : ''}`}>{label}</span>
      {children}
    </>
  )
}

/** Desktop: 360px panel on the right. Changes save immediately; Simpan only closes. */
export function DetailPanel({ task }: { task: Task }) {
  const d = useDetail(task)
  const t = task
  useEscape(d.close)
  return (
    <aside aria-label="Detail tugas" className="animate-slide flex w-[360px] flex-none flex-col gap-9 overflow-auto border-l border-line bg-surface px-11 pt-10 pb-12">
      <div className="flex items-center gap-4">
        <span className="text-label flex-1 text-fg3">DETAIL TUGAS</span>
        <button type="button" aria-label="Tutup detail" onClick={d.close} className="size-14 rounded-sm border-0 bg-surface2 text-[14px] text-fg2">✕</button>
      </div>
      <div className="flex items-start gap-5">
        <CheckButton t={t} size={22} />
        <textarea value={t.title} onChange={e => d.upd({ title: e.target.value })} rows={2} aria-label="Judul tugas" className="flex-1 resize-none border-0 bg-transparent p-0 font-display text-[20px] leading-tight font-semibold text-fg outline-none" />
      </div>
      <div className="grid grid-cols-[86px_1fr] items-center gap-x-5 gap-y-7 text-[13px]">
        <Row label="Lokasi" top><Location d={d} /></Row>
        <Row label="Status"><StatusPicker t={t} /></Row>
        <Row label="Prioritas"><PrioPicker value={t.prio} onChange={p => d.upd({ prio: p })} /></Row>
        <Row label="Tanggal" top>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Sehari sebelumnya" onClick={() => d.shift(-1)} className="size-13 rounded-[6px] border border-line2 bg-transparent text-fg2">‹</button>
              <span className="min-w-[110px] text-center">{t.due ? fmtDay(t.due) : 'Tanpa tanggal'}</span>
              <button type="button" aria-label="Sehari sesudahnya" onClick={() => d.shift(1)} className="size-13 rounded-[6px] border border-line2 bg-transparent text-fg2">›</button>
            </div>
            <DueChips d={d} />
          </div>
        </Row>
        <Row label="Mulai">
          <div className="flex flex-wrap items-center gap-4">
            <input type="date" value={t.start ?? ''} onChange={e => { const v = e.target.value || null; d.upd({ start: v, due: v && (!t.due || t.due < v) ? v : t.due }) }} aria-label="Tanggal mulai" className={`${input} h-15`} />
            {t.start && <button type="button" onClick={() => d.upd({ start: null })} className="border-0 bg-transparent text-[12px] font-medium text-fg3">Hapus</button>}
            <span className="text-[12px] text-fg3">{startHint(t)}</span>
          </div>
        </Row>
        <Row label="Jam">
          <div className="flex items-center gap-4">
            <input type="time" value={t.time ?? ''} onChange={e => d.upd({ time: e.target.value || null })} aria-label="Jam tugas" className={`${input} h-15`} />
            {t.time && <button type="button" onClick={() => d.upd({ time: null })} className="border-0 bg-transparent text-[12px] font-medium text-fg3">Hapus jam</button>}
          </div>
        </Row>
        <Row label="Durasi" top><Duration d={d} /></Row>
        <Row label="Ulangi" top><Repeat d={d} /></Row>
        {d.proj && d.proj.members.length > 1 && <Row label="PIC"><Pics d={d} /></Row>}
        <Row label="Pengingat" top><Reminders d={d} /></Row>
      </div>
      <label className="flex flex-col gap-3 text-[13px] text-fg3">
        Catatan
        <textarea value={t.notes} onChange={e => d.upd({ notes: e.target.value })} rows={4} placeholder="Tambahkan catatan atau tempel tautan…" className="resize-y rounded-md border border-line bg-bg px-6 py-5 text-[13px] leading-normal text-fg outline-none" />
      </label>
      <div className="flex-1" />
      <div className="flex gap-4">
        <button type="button" onClick={d.close} className="h-19 flex-1 rounded-[9px] border-0 bg-fg text-[13px] font-semibold text-bg">Simpan</button>
        <button type="button" onClick={() => d.s.deleteTask(t.id)} className="h-19 rounded-[9px] border border-line2 bg-transparent px-8 text-[13px] font-medium text-high">Hapus</button>
      </div>
    </aside>
  )
}

/** Phone: bottom sheet with the same fields, larger touch targets. */
export function DetailSheet({ task }: { task: Task }) {
  const d = useDetail(task)
  const t = task
  const lbl = 'text-label text-fg3'
  return (
    <Sheet onClose={d.close} label="Detail tugas">
      <div className="flex items-start gap-5">
        <CheckButton t={t} size={24} />
        <textarea value={t.title} onChange={e => d.upd({ title: e.target.value })} rows={2} aria-label="Judul tugas" className="flex-1 resize-none border-0 bg-transparent p-0 font-display text-[21px] leading-tight font-semibold text-fg outline-none" />
      </div>
      <div className="flex flex-col gap-4"><span className={lbl}>LOKASI</span><Location d={d} big /></div>
      <div className="flex flex-col gap-4"><span className={lbl}>STATUS</span><StatusPicker t={t} big /></div>
      <div className="flex flex-col gap-4"><span className={lbl}>PRIORITAS</span><PrioPicker size="lg" stretch value={t.prio} onChange={p => d.upd({ prio: p })} /></div>
      <div className="flex flex-col rounded-[12px] bg-bg text-[14px]">
        <div className="flex items-center gap-4 border-b border-line py-3 pr-4 pl-7">
          <span className="flex-1 text-fg2">Tanggal</span>
          <button type="button" aria-label="Sehari sebelumnya" onClick={() => d.shift(-1)} className="size-18 border-0 bg-transparent text-[18px] text-fg2">‹</button>
          <span>{t.due ? fmtDay(t.due) : 'Tanpa tanggal'}</span>
          <button type="button" aria-label="Sehari sesudahnya" onClick={() => d.shift(1)} className="size-18 border-0 bg-transparent text-[18px] text-fg2">›</button>
        </div>
        <div className="border-b border-line px-7 py-5"><DueChips d={d} big /></div>
        <div className="flex items-center gap-4 border-b border-line py-3.5 pr-4 pl-7">
          <span className="flex-1 text-fg2">Mulai</span>
          {t.start && <button type="button" onClick={() => d.upd({ start: null })} className="border-0 bg-transparent p-3 text-[13px] font-medium text-fg3">Hapus</button>}
          <input type="date" value={t.start ?? ''} onChange={e => { const v = e.target.value || null; d.upd({ start: v, due: v && (!t.due || t.due < v) ? v : t.due }) }} aria-label="Tanggal mulai" className={`${input} h-18`} />
        </div>
        <div className="flex items-center gap-4 py-3.5 pr-4 pl-7">
          <span className="flex-1 text-fg2">Jam</span>
          {t.time && <button type="button" onClick={() => d.upd({ time: null })} className="border-0 bg-transparent p-3 text-[13px] font-medium text-fg3">Hapus</button>}
          <input type="time" value={t.time ?? ''} onChange={e => d.upd({ time: e.target.value || null })} aria-label="Jam tugas" className={`${input} h-18`} />
        </div>
        <div className="flex flex-col gap-4 border-t border-line px-7 py-6"><span className="text-fg2">Durasi</span><Duration d={d} big /></div>
        <div className="flex flex-col gap-4 border-t border-line px-7 py-6"><span className="text-fg2">Ulangi</span><Repeat d={d} big /></div>
        <div className="flex flex-col gap-4 border-t border-line px-7 py-6"><span className="text-fg2">Pengingat</span><Reminders d={d} big /></div>
      </div>
      {d.proj && d.proj.members.length > 1 && <div className="flex flex-col gap-4"><span className={lbl}>PIC</span><Pics d={d} big /></div>}
      <textarea value={t.notes} onChange={e => d.upd({ notes: e.target.value })} rows={3} placeholder="Catatan atau tautan…" aria-label="Catatan" className="resize-none rounded-[12px] border border-line bg-bg px-7 py-6 text-[14px] leading-normal text-fg outline-none" />
      <div className="flex gap-4">
        <button type="button" onClick={() => d.s.deleteTask(t.id)} className="h-24 rounded-[12px] border border-line2 bg-transparent px-9 text-[15px] font-medium text-high">Hapus</button>
        <button type="button" onClick={d.close} className="h-24 flex-1 rounded-[12px] border-0 bg-fg text-[15px] font-semibold text-bg">Simpan</button>
      </div>
    </Sheet>
  )
}
