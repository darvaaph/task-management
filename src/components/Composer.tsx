import { useState } from 'react'
import { fmt, rel, today, addDays, nextMonday } from '../lib/dates'
import { destInfo, parseDest, type Dest } from '../lib/logic'
import type { ISODate, Priority, Recurrence, Task } from '../lib/types'
import { useStore } from '../store'
import { DestButton, DestList } from './DestPicker'
import { FoldRow, PickerRow, REM_DAY, REM_TIMED, Reminders, Repeat, recLabel, remLabel, type RuleDraft } from './TaskDetail'
import { AutoTextarea, Avatar, Chip, DateChip, PrioPicker, Sheet, btnPrimary } from './ui'

/** Default destination and date follow the page, but are always visible and can be changed. */
function useDefaults() {
  const { ui, projects } = useStore()
  if (ui.view === 'project') {
    const p = projects.find(x => x.id === ui.projectId)
    return { dest: p ? `proj:${p.id}${p.sections.length ? ':' + p.sections[0] : ''}` : 'inbox', due: null }
  }
  if (ui.view === 'inbox') return { dest: ui.inboxArea !== 'all' && ui.inboxArea !== 'none' ? `area:${ui.inboxArea}` : 'inbox', due: null }
  if (ui.view === 'jadwal') return { dest: 'inbox', due: ui.calDay }
  return { dest: 'inbox', due: today() }
}

function useComposer(onDone?: () => void) {
  const s = useStore()
  const def = useDefaults()
  const [title, setTitle] = useState('')
  const [dest, setDest] = useState<Dest | null>(null)
  const [due, setDue] = useState<ISODate | null | 'auto'>('auto')
  const [prio, setPrio] = useState<Priority>('med')
  const [pic, setPic] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [more, setMore] = useState(false)
  const [time, setTime] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [rec, setRec] = useState<Recurrence | null>(null)
  // null = untouched, so the task keeps the default reminder.
  const [rems, setRems] = useState<string[] | null>(null)
  const curDest = dest ?? def.dest
  const curDue = due === 'auto' ? def.due : due
  const dp = parseDest(curDest)
  const proj = dp.project ? s.projects.find(p => p.id === dp.project) : undefined
  const pics = proj && proj.members.length > 1 ? proj.members : null
  const curPic = pics && pic && pics.includes(pic) ? pic : s.selfId

  const dues: [string, ISODate | null][] = [['Hari ini', today()], ['Besok', addDays(today(), 1)]]
  // On Sundays "Senin depan" is the same day as "Besok".
  if (!dues.some(([, d]) => d === nextMonday())) dues.push(['Senin depan', nextMonday()])
  if (s.ui.view === 'jadwal' && !dues.some(([, d]) => d === s.ui.calDay)) dues.push([fmt(s.ui.calDay), s.ui.calDay])
  dues.push(['Tanpa tanggal', null])
  const customDue = !dues.some(([, d]) => d === curDue)

  // Destination or time can change after a choice was made, so drop whatever no longer applies.
  const proOk = proj ? s.isProFor(proj) : s.isPro
  const curRec = rec && !proOk && (rec === 'weekdays' || rec === 'monthly') ? null : rec
  const remKeys = (time ? REM_TIMED : REM_DAY).map(([k]) => k)
  const fitRems = rems?.filter(k => remKeys.includes(k)).slice(0, proOk ? undefined : 1)
  const curRems = !curDue || !rems || (rems.length > 0 && !fitRems?.length) ? undefined : fitRems
  const rules: RuleDraft = {
    s,
    proj,
    t: { rec: curRec, rems: curRems, due: curDue, time },
    upd: (patch: Partial<Task>) => {
      if (patch.rec !== undefined) setRec(patch.rec)
      if (patch.rems !== undefined) setRems(patch.rems)
      // Turning repeat on for an undated task dates it today.
      if (patch.due !== undefined && patch.due !== curDue) setDue(patch.due)
    },
  }

  const submit = () => {
    const tt = title.trim()
    if (!tt) return
    s.addTask({ title: tt, dest: curDest, due: curDue, prio, pic: pics ? curPic : null, time, notes: notes.trim(), rec: curRec, rems: curRems })
    const when = curDue == null ? 'tanpa tanggal' : ['Hari ini', 'Besok'].includes(rel(curDue)) ? rel(curDue).toLowerCase() : fmt(curDue)
    s.say(`Ditambahkan ke ${destInfo(curDest, s.projects, s.areas).label} · ${when}`)
    setTitle('')
    setPicking(false)
    // Time and notes belong to one task, so unlike destination and date they don't carry over.
    setMore(false)
    setTime(null)
    setNotes('')
    setRec(null)
    setRems(null)
    onDone?.()
  }

  return { title, setTitle, curDest, setDest, curDue, setDue, prio, setPrio, projId: proj?.id, pics, curPic, setPic, picking, setPicking, dues, customDue, more, setMore, time, setTime, notes, setNotes, rules, submit }
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-9 w-px bg-line2" />

/** Desktop: input row + one line of "Ke [tujuan] | dates | priority". Destination and date stay after adding. */
export function InlineComposer({ placeholder }: { placeholder: string }) {
  const c = useComposer()
  return (
    <div className="flex w-full flex-col gap-4 rounded-[12px] border border-line bg-surface pt-3 pr-3 pb-5 pl-7">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="text-[18px] leading-none text-fg3">+</span>
        <input
          value={c.title}
          onChange={e => c.setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && c.submit()}
          placeholder={placeholder}
          aria-label="Judul tugas baru"
          className="h-18 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
        />
        <button type="button" onClick={c.submit} className={btnPrimary}>Tambah</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12.5px] text-fg3">Ke</span>
        <DestButton value={c.curDest} open={c.picking} onToggle={() => c.setPicking(!c.picking)} />
        <Divider />
        {c.dues.map(([l, d]) => <Chip key={l} size="sm" active={c.curDue === d} onClick={() => c.setDue(d)}>{l}</Chip>)}
        <DateChip size="sm" value={c.curDue} custom={c.customDue} onChange={c.setDue} />
      </div>
      {c.picking && <DestList value={c.curDest} onPick={v => { c.setDest(v); c.setPicking(false) }} />}
      {c.pics && <PicRow pics={c.pics} projectId={c.projId} value={c.curPic} onPick={c.setPic} />}
      <div className="flex flex-wrap items-center gap-3">
        <PrioPicker value={c.prio} onChange={c.setPrio} />
        <Divider />
        <MoreToggle c={c} />
      </div>
      {c.more && <MoreFields c={c} />}
    </div>
  )
}

type ComposerState = ReturnType<typeof useComposer>

/** Stays highlighted while folded if something is filled in, so hidden values aren't saved by surprise. */
function MoreToggle({ c, big }: { c: ComposerState; big?: boolean }) {
  const filled = !!c.time || !!c.notes.trim() || !!c.rules.t.rec || c.rules.t.rems !== undefined
  return (
    <button
      type="button"
      aria-expanded={c.more}
      onClick={() => c.setMore(!c.more)}
      className={`flex-none border font-medium ${big ? 'h-18 self-start rounded-pill px-7 text-[13px]' : 'h-14 rounded-sm px-4.5 text-[12px]'} ${filled ? 'border-accent bg-accent-soft text-accent' : 'border-line2 bg-transparent text-fg2'}`}
    >
      Rincian <span aria-hidden="true">{c.more ? '▴' : '▾'}</span>
    </button>
  )
}

/** Phone: the same card of rows as task detail. */
function MoreFieldsPhone({ c }: { c: ComposerState }) {
  const [fold, setFold] = useState<'rec' | 'rem' | null>(null)
  const toggle = (k: 'rec' | 'rem') => setFold(f => (f === k ? null : k))
  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-[12px] bg-bg text-[14px] [&>*:first-child]:border-t-0">
        <PickerRow label="Jam" type="time" value={c.time} shown={c.time ?? 'Tidak ada'} onChange={c.setTime} onClear={() => c.setTime(null)} />
        <FoldRow label="Ulangi" value={recLabel(c.rules.t)} open={fold === 'rec'} onToggle={() => toggle('rec')}><Repeat d={c.rules} big /></FoldRow>
        <FoldRow label="Pengingat" value={remLabel(c.rules.t)} open={fold === 'rem'} onToggle={() => toggle('rem')}><Reminders d={c.rules} big /></FoldRow>
      </div>
      <label className="flex flex-col gap-4">
        <span className="text-label text-fg3">CATATAN</span>
        <AutoTextarea rows={2} maxLength={10000} value={c.notes} onChange={e => c.setNotes(e.target.value)} placeholder="Catatan atau tautan…" className="resize-none rounded-[12px] border border-line bg-bg px-7 py-5 text-[14px] leading-normal text-fg outline-none placeholder:text-fg3 focus:border-accent" />
      </label>
    </>
  )
}

function MoreFields({ c }: { c: ComposerState }) {
  const label = 'text-[12.5px] text-fg3'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-4">
          <span className={label}>Jam</span>
          <input type="time" value={c.time ?? ''} onChange={e => c.setTime(e.target.value || null)} className="h-15 rounded-[8px] border border-line2 bg-bg px-4 text-[13px] font-medium text-fg" />
        </label>
        {c.time && <button type="button" onClick={() => c.setTime(null)} className="border-0 bg-transparent p-3 text-[12px] font-medium text-fg3">Hapus jam</button>}
      </div>
      <div role="group" aria-label="Ulangi" className="flex flex-col gap-3">
        <span aria-hidden="true" className={label}>Ulangi</span>
        <Repeat d={c.rules} />
      </div>
      <div role="group" aria-label="Pengingat" className="flex flex-col gap-3">
        <span aria-hidden="true" className={label}>Pengingat</span>
        <Reminders d={c.rules} />
      </div>
      <label className="flex flex-col gap-3">
        <span className={label}>Catatan</span>
        <AutoTextarea rows={2} maxLength={10000} value={c.notes} onChange={e => c.setNotes(e.target.value)} placeholder="Catatan atau tautan…" className="resize-none rounded-[8px] border border-line2 bg-bg px-5 py-4 text-[13px] leading-normal text-fg outline-none placeholder:text-fg3 focus:border-accent" />
      </label>
    </div>
  )
}

/** Own row so the "PIC" label never wraps away from its chips; chips wrap beside the label. */
function PicRow({ pics, projectId, value, onPick, big }: { pics: string[]; projectId?: string; value: string; onPick: (id: string) => void; big?: boolean }) {
  return (
    <div role="group" aria-label="PIC" className="flex items-start gap-4">
      <span aria-hidden="true" className={`flex flex-none items-center text-fg3 ${big ? 'h-18 text-[13px]' : 'h-14 text-[12.5px]'}`}>PIC</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-3">
        {pics.map(k => <PicChip key={k} big={big} id={k} projectId={projectId} active={value === k} onClick={() => onPick(k)} />)}
      </div>
    </div>
  )
}

function PicChip({ id, projectId, active, onClick, big }: { id: string; projectId?: string; active: boolean; onClick: () => void; big?: boolean }) {
  const s = useStore()
  const p = s.personOf(id, projectId)
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`PIC ${p.name}`}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-pill border pr-5 pl-1.5 text-[12.5px] font-medium text-fg ${big ? 'h-18' : 'h-14'} ${active ? 'border-accent bg-accent-soft' : 'border-line2 bg-transparent'}`}
    >
      <Avatar i={p.i} c={p.c} size={big ? 28 : 20} />
      {p.name}
    </button>
  )
}

/** Phone: Tambah Tugas sheet. Closing resets everything to the page's defaults. */
export function QuickSheet({ onClose }: { onClose: () => void }) {
  const c = useComposer(onClose)
  return (
    <Sheet onClose={onClose} label="Tambah tugas" maxH="92%">
      <div className="font-mono text-[13px] font-semibold tracking-[.06em] text-fg3">TAMBAH TUGAS</div>
      {/* No autofocus: the keyboard would cover Ke, date and priority. A boxed field shows it is tappable. */}
      <label className="flex flex-col gap-3">
        <span className="text-[13px] text-fg3">Judul tugas</span>
        <input
          value={c.title}
          onChange={e => c.setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && c.submit()}
          placeholder="Apa yang perlu dikerjakan?"
          className="h-26 rounded-[12px] border-[1.5px] border-line2 bg-bg px-7 text-[17px] font-medium text-fg outline-none transition-colors duration-(--dur-fast) placeholder:text-fg3 focus:border-accent"
        />
      </label>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-fg3">Ke</span>
          <DestButton tall value={c.curDest} open={c.picking} onToggle={() => c.setPicking(!c.picking)} />
        </div>
        {c.picking && <DestList tall value={c.curDest} onPick={v => { c.setDest(v); c.setPicking(false) }} />}
      </div>
      <div className="flex flex-wrap gap-3">
        {c.dues.map(([l, d]) => <Chip key={l} size="lg" active={c.curDue === d} onClick={() => c.setDue(d)}>{l}</Chip>)}
        <DateChip size="lg" value={c.curDue} custom={c.customDue} onChange={c.setDue} />
      </div>
      <PrioPicker size="lg" stretch value={c.prio} onChange={c.setPrio} />
      {c.pics && <PicRow big pics={c.pics} projectId={c.projId} value={c.curPic} onPick={c.setPic} />}
      <MoreToggle big c={c} />
      {c.more && <MoreFieldsPhone c={c} />}
      <button type="button" onClick={c.submit} className="h-25 rounded-[12px] border-0 bg-fg text-[15px] font-semibold text-bg">Simpan tugas</button>
    </Sheet>
  )
}
