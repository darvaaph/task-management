import { useRef, useState, type ReactNode } from 'react'
import { PRIO, STATUS, STATUS_KEYS } from '../lib/constants'
import { addDays, diffDays, fmt, fmtDay, nextMonday, today } from '../lib/dates'
import { destInfo, destOfTask, remindersOf } from '../lib/logic'
import type { Recurrence, Task } from '../lib/types'
import { ProBadge } from './Pro'
import { NotifyHint } from './Reminders'
import { useStore } from '../store'
import { DestButton, DestList } from './DestPicker'
import { AutoTextarea, Avatar, Chip, PrioPicker, Sheet, useEscape } from './ui'

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
  const [pop, setPop] = useState(false)
  return (
    <button
      type="button"
      aria-label={done ? 'Tandai belum selesai' : 'Tandai selesai'}
      aria-pressed={done}
      onClick={() => { if (!done) setPop(true); s.toggleTask(t.id) }}
      onAnimationEnd={() => setPop(false)}
      className={`mt-0.5 grid flex-none place-items-center rounded-full p-0 text-[12px] font-bold text-bg transition-colors duration-(--dur-fast) ${pop ? 'animate-pop' : ''}`}
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
        const p = d.s.personOf(k, d.proj!.id)
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

// Written from the minutes, not the chip list: demo data (and later imports) can hold lengths like 90 min.
const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} mnt` : ''}` : `${m} mnt`)
const durLabel = (t: Task) => (!t.time ? 'Atur jam dulu' : t.dur ? fmtDur(t.dur) : 'Tanpa')
const recLabel = (t: Task) => RECS.find(([v]) => v === (t.rec ?? null))?.[1] ?? 'Tidak'
const remLabel = (t: Task) => {
  if (!t.due) return 'Atur tanggal dulu'
  const names = remindersOf(t).map(k => [...REM_TIMED, ...REM_DAY].find(([x]) => x === k)?.[1]).filter(Boolean)
  return names.length ? names.join(', ') : 'Tidak ada'
}

/** Phone: a date or time row that shows its value and opens the device's own picker on tap. */
function PickerRow({ label, type, value, shown, onChange, onClear }: { label: string; type: 'date' | 'time'; value: string | null; shown: string; onChange: (v: string | null) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-h-22 items-center gap-4 border-t border-line pr-4 pl-7 text-[14px]">
      <span className="flex-none text-fg2">{label}</span>
      <span className="flex-1" />
      {value && <button type="button" onClick={onClear} className="border-0 bg-transparent p-3 text-[13px] font-medium text-fg3">Hapus</button>}
      <span className="relative">
        <button type="button" onClick={() => openPicker(ref.current)} className={`h-18 rounded-pill border-0 px-6 text-[14px] font-medium ${value ? 'bg-surface2 text-fg' : 'bg-transparent text-fg3'}`}>{shown}</button>
        <input ref={ref} type={type} value={value ?? ''} onChange={e => onChange(e.target.value || null)} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
      </span>
    </div>
  )
}

// The raw date field shows the browser's own format ("25-Nov-2026"); a chip that opens the picker keeps the app's wording.
const openPicker = (el: HTMLInputElement | null) => {
  if (!el) return
  try { el.showPicker() } catch { el.focus(); el.click() }
}

/** Phone: quick date chips plus "Pilih tanggal…", which opens the device calendar. */
function DueChipsPhone({ d }: { d: ReturnType<typeof useDetail> }) {
  const ref = useRef<HTMLInputElement>(null)
  const opts: [string, string | null][] = [['Hari ini', today()], ['Besok', addDays(today(), 1)], ['Senin depan', nextMonday()], ['Tanpa tanggal', null]]
  const custom = d.t.due != null && !opts.some(([, v]) => v === d.t.due)
  return (
    <div className="flex flex-wrap gap-2.5">
      {opts.map(([l, v]) => <Chip key={l} size="lg" active={d.t.due === v} onClick={() => d.setDue(v)}>{l}</Chip>)}
      <span className="relative">
        <Chip size="lg" active={custom} onClick={() => openPicker(ref.current)}>{custom ? fmt(d.t.due) : 'Pilih tanggal…'}</Chip>
        <input ref={ref} type="date" value={d.t.due ?? ''} onChange={e => d.setDue(e.target.value || null)} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
      </span>
    </div>
  )
}

/** Phone: a setting that shows its current value and opens its chips on tap, so the sheet stays short. */
function FoldRow({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col border-t border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-22 items-center gap-4 border-0 bg-transparent py-3 pr-6 pl-7 text-left text-[14px]">
        <span className="flex-none text-fg2">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-fg">{value}</span>
        <span aria-hidden="true" className={`flex-none text-[16px] text-fg3 transition-transform duration-(--dur-fast) ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="px-7 pb-6">{children}</div>}
    </div>
  )
}

/** A chip that, when locked, shows PRO and opens the Pro screen instead. */
function LockChip({ active, locked, onClick, children, big }: { active: boolean; locked?: boolean; onClick: () => void; children: ReactNode; big?: boolean }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`flex items-center gap-2.5 whitespace-nowrap rounded-pill border px-5.5 text-[12.5px] font-medium ${big ? 'h-17' : 'h-14'} ${active ? 'border-fg bg-fg text-bg' : 'border-line2 bg-transparent text-fg2'}`}>
      {children}{locked && <ProBadge />}
    </button>
  )
}

function Duration({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  // Length only shows as a time range and a block height, both anchored on the start time.
  if (!d.t.time) return <span className="text-[13px] text-fg3">Atur jam dulu untuk memasang durasi.</span>
  const proOk = d.proj ? d.s.isProFor(d.proj) : d.s.isPro
  return (
    <div className="flex flex-wrap gap-2.5">
      {DURS.map(([v, l]) => {
        const locked = !proOk && v != null
        return <LockChip key={l} big={big} active={(d.t.dur ?? null) === v} locked={locked} onClick={() => (locked ? d.s.openPro('dur', d.proj) : d.upd({ dur: v }))}>{l}</LockChip>
      })}
    </div>
  )
}

function Repeat({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  const proOk = d.proj ? d.s.isProFor(d.proj) : d.s.isPro
  return (
    <div className="flex flex-wrap gap-2.5">
      {RECS.map(([v, l, pro]) => {
        const locked = pro && !proOk
        // Turning repeat on for an undated task dates it today.
        return <LockChip key={l} big={big} active={(d.t.rec ?? null) === v} locked={locked} onClick={() => (locked ? d.s.openPro('rec', d.proj) : d.upd({ rec: v, due: v && !d.t.due ? today() : d.t.due }))}>{l}</LockChip>
      })}
    </div>
  )
}

/** Free: one reminder (picking another replaces it). Pro: several. */
function Reminders({ d, big }: { d: ReturnType<typeof useDetail>; big?: boolean }) {
  if (!d.t.due) return <span className="text-[13px] text-fg3">Atur tanggal dulu untuk memasang pengingat.</span>
  const cur = remindersOf(d.t)
  const proOk = d.proj ? d.s.isProFor(d.proj) : d.s.isPro
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {(d.t.time ? REM_TIMED : REM_DAY).map(([k, l]) => {
          const on = cur.includes(k)
          return <LockChip key={k} big={big} active={on} onClick={() => d.upd({ rems: on ? cur.filter(x => x !== k) : proOk ? [...cur, k] : [k] })}>{l}</LockChip>
        })}
      </div>
      <p className="m-0 text-[12px] leading-normal text-fg3">
        {proOk ? 'Bisa pilih lebih dari satu.' : <>Gratis: 1 pengingat per tugas. Lebih dari satu di <button type="button" onClick={() => d.s.openPro('rem', d.proj)} aria-label={d.s.canUpgradeFor(d.proj) ? 'Lihat TaskFlow Pro' : 'Info paket proyek'} className="inline-flex border-0 bg-transparent p-0 align-middle"><ProBadge /></button></>}
      </p>
      {cur.length > 0 && <NotifyHint />}
    </div>
  )
}

const URL_RE = /https?:\/\/[^\s<>()]+/g

function NoteLinks({ text }: { text: string }) {
  const urls = Array.from(new Set((text.match(URL_RE) ?? []).map(u => u.replace(/[.,;:!?)]+$/, ''))))
  if (!urls.length) return null
  return (
    <div className="flex flex-wrap gap-2.5">
      {urls.map(u => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-2 rounded-sm border border-line2 bg-bg px-4 py-2 text-[12px] font-medium text-accent no-underline hover:bg-hover"
        >
          <span className="truncate">{u.replace(/^https?:\/\//, '')}</span>
          <span aria-hidden="true" className="flex-none">↗</span>
        </a>
      ))}
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
export function DetailPanel({ task, floating }: { task: Task; floating?: boolean }) {
  const d = useDetail(task)
  const t = task
  useEscape(d.close)
  const panel = (
    <aside aria-label="Detail tugas" className={`animate-slide flex w-[360px] flex-col ${floating ? 'fixed inset-y-0 right-0 z-[7] max-w-[calc(100vw-48px)] shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)]' : 'flex-none'} gap-9 overflow-auto border-l border-line bg-surface px-11 pt-10 pb-12`}>
      <div className="flex items-center gap-4">
        <span className="text-label flex-1 text-fg3">DETAIL TUGAS</span>
        <button type="button" aria-label="Tutup detail" onClick={d.close} className="size-14 rounded-sm border-0 bg-surface2 text-[14px] text-fg2">✕</button>
      </div>
      <div className="flex items-start gap-5">
        <CheckButton t={t} size={22} />
        <AutoTextarea value={t.title} onChange={e => d.upd({ title: e.target.value })} onBlur={d.s.flushWrites} aria-label="Judul tugas" className="flex-1 resize-none border-0 bg-transparent p-0 font-display text-[20px] leading-tight font-semibold text-fg outline-none" />
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-3 text-[13px] text-fg3">
          Catatan
          <AutoTextarea value={t.notes} onChange={e => d.upd({ notes: e.target.value })} onBlur={d.s.flushWrites} rows={2} placeholder="Tambahkan catatan atau tempel tautan…" className="resize-none rounded-md border border-line bg-bg px-6 py-5 text-[13px] leading-normal text-fg outline-none" />
        </label>
        <NoteLinks text={t.notes} />
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
      <div className="flex-1" />
      <div className="flex gap-4">
        <button type="button" onClick={d.close} className="h-19 flex-1 rounded-[9px] border-0 bg-fg text-[13px] font-semibold text-bg">Simpan</button>
        <button type="button" onClick={() => d.s.deleteTask(t.id)} className="h-19 rounded-[9px] border border-line2 bg-transparent px-8 text-[13px] font-medium text-high">Hapus</button>
      </div>
    </aside>
  )
  if (!floating) return panel
  return (
    <>
      <div aria-hidden="true" className="animate-fade fixed inset-0 z-[6] bg-black/30" onClick={d.close} />
      {panel}
    </>
  )
}

/** Phone: bottom sheet with the same fields, larger touch targets. */
type Fold = 'loc' | 'dur' | 'rec' | 'rem' | 'pic'

export function DetailSheet({ task }: { task: Task }) {
  const d = useDetail(task)
  const t = task
  const lbl = 'text-label text-fg3'
  const [fold, setFold] = useState<Fold | null>(null)
  const toggle = (k: Fold) => setFold(f => (f === k ? null : k))
  const cur = destOfTask(t)
  const who = t.assignee ? d.s.personOf(t.assignee, t.project ?? undefined).name : null
  return (
    <Sheet onClose={d.close} label="Detail tugas">
      <div className="flex items-start gap-5">
        <CheckButton t={t} size={24} />
        <AutoTextarea value={t.title} onChange={e => d.upd({ title: e.target.value })} onBlur={d.s.flushWrites} aria-label="Judul tugas" className="flex-1 resize-none border-0 bg-transparent p-0 font-display text-[21px] leading-tight font-semibold text-fg outline-none" />
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-4"><span className={lbl}>CATATAN</span>
          <AutoTextarea value={t.notes} onChange={e => d.upd({ notes: e.target.value })} onBlur={d.s.flushWrites} placeholder="Catatan atau tautan…" className="resize-none rounded-[12px] border border-line bg-bg px-7 py-5 text-[14px] leading-normal text-fg outline-none" />
        </label>
        <NoteLinks text={t.notes} />
      </div>
      <div className="flex flex-col gap-4"><span className={lbl}>STATUS</span><StatusPicker t={t} big /></div>
      <div className="flex flex-col gap-4"><span className={lbl}>PRIORITAS</span><PrioPicker size="lg" stretch value={t.prio} onChange={p => d.upd({ prio: p })} /></div>
      <div className="flex flex-col gap-4">
        <span className={lbl}>RINCIAN</span>
        {/* One list style for every property: label left, value right. */}
        <div className="flex flex-col overflow-hidden rounded-[12px] bg-bg text-[14px] [&>*:first-child]:border-t-0">
          <FoldRow label="Lokasi" value={destInfo(cur, d.s.projects, d.s.areas).label} open={fold === 'loc'} onToggle={() => toggle('loc')}>
            <DestList tall value={cur} onPick={v => { d.s.moveTask(t, v); setFold(null) }} />
          </FoldRow>
          <div className="flex flex-col gap-4 border-t border-line pt-3 pr-4 pb-6 pl-7">
            <div className="flex min-h-19 items-center gap-2">
              <span className="flex-1 text-fg2">Tanggal</span>
              <button type="button" aria-label="Sehari sebelumnya" onClick={() => d.shift(-1)} className="size-20 border-0 bg-transparent text-[18px] text-fg2">‹</button>
              <span className="min-w-[96px] text-center font-medium text-fg">{t.due ? fmtDay(t.due) : 'Tanpa tanggal'}</span>
              <button type="button" aria-label="Sehari sesudahnya" onClick={() => d.shift(1)} className="size-20 border-0 bg-transparent text-[18px] text-fg2">›</button>
            </div>
            <DueChipsPhone d={d} />
          </div>
          <PickerRow
            label="Mulai" type="date" value={t.start} shown={t.start ? `${fmt(t.start)} · ${startHint(t)}` : 'Tidak ada'}
            onChange={v => d.upd({ start: v, due: v && (!t.due || t.due < v) ? v : t.due })} onClear={() => d.upd({ start: null })}
          />
          <PickerRow label="Jam" type="time" value={t.time} shown={t.time ?? 'Tidak ada'} onChange={v => d.upd({ time: v })} onClear={() => d.upd({ time: null })} />
          <FoldRow label="Durasi" value={durLabel(t)} open={fold === 'dur'} onToggle={() => toggle('dur')}><Duration d={d} big /></FoldRow>
          <FoldRow label="Ulangi" value={recLabel(t)} open={fold === 'rec'} onToggle={() => toggle('rec')}><Repeat d={d} big /></FoldRow>
          <FoldRow label="Pengingat" value={remLabel(t)} open={fold === 'rem'} onToggle={() => toggle('rem')}><Reminders d={d} big /></FoldRow>
          {d.proj && d.proj.members.length > 1 && (
            <FoldRow label="PIC" value={who ?? 'Belum ada'} open={fold === 'pic'} onToggle={() => toggle('pic')}><Pics d={d} big /></FoldRow>
          )}
        </div>
      </div>
      {/* Pinned to the sheet's bottom edge (offset by the sheet's own bottom padding) so closing never needs a scroll. */}
      <div className="sticky bottom-[calc(-1*max(34px,calc(env(safe-area-inset-bottom)+12px)))] z-[1] -mx-10 -mb-[max(34px,calc(env(safe-area-inset-bottom)+12px))] flex gap-4 border-t border-line bg-surface px-10 pt-5 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => d.s.deleteTask(t.id)} className="h-24 rounded-[12px] border border-line2 bg-transparent px-9 text-[15px] font-medium text-high">Hapus</button>
        <button type="button" onClick={d.close} className="h-24 flex-1 rounded-[12px] border-0 bg-fg text-[15px] font-semibold text-bg">Simpan</button>
      </div>
    </Sheet>
  )
}
