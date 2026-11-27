import { useState } from 'react'
import { fmt, rel, today, addDays } from '../lib/dates'
import { destInfo, parseDest, type Dest } from '../lib/logic'
import type { ISODate, Priority } from '../lib/types'
import { useStore } from '../store'
import { DestButton, DestList } from './DestPicker'
import { Avatar, Chip, PrioPicker, Sheet, btnPrimary } from './ui'

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
  const curDest = dest ?? def.dest
  const curDue = due === 'auto' ? def.due : due
  const dp = parseDest(curDest)
  const proj = dp.project ? s.projects.find(p => p.id === dp.project) : undefined
  const pics = proj && proj.members.length > 1 ? proj.members : null
  const curPic = pics && pic && pics.includes(pic) ? pic : s.selfId

  const dues: [string, ISODate | null][] = [['Hari ini', today()], ['Besok', addDays(today(), 1)]]
  if (s.ui.view === 'jadwal' && !dues.some(([, d]) => d === s.ui.calDay)) dues.push([fmt(s.ui.calDay), s.ui.calDay])
  dues.push(['Tanpa tanggal', null])

  const submit = () => {
    const tt = title.trim()
    if (!tt) return
    s.addTask({ title: tt, dest: curDest, due: curDue, prio, pic: pics ? curPic : null })
    const when = curDue == null ? 'tanpa tanggal' : ['Hari ini', 'Besok'].includes(rel(curDue)) ? rel(curDue).toLowerCase() : fmt(curDue)
    s.say(`Ditambahkan ke ${destInfo(curDest, s.projects, s.areas).label} · ${when}`)
    setTitle('')
    setPicking(false)
    onDone?.()
  }

  return { title, setTitle, curDest, setDest, curDue, setDue, prio, setPrio, projId: proj?.id, pics, curPic, setPic, picking, setPicking, dues, submit }
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
        <Divider />
        <PrioPicker value={c.prio} onChange={c.setPrio} />
      </div>
      {c.picking && <DestList value={c.curDest} onPick={v => { c.setDest(v); c.setPicking(false) }} />}
      {c.pics && <PicRow pics={c.pics} projectId={c.projId} value={c.curPic} onPick={c.setPic} />}
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
      </div>
      <PrioPicker size="lg" stretch value={c.prio} onChange={c.setPrio} />
      {c.pics && <PicRow big pics={c.pics} projectId={c.projId} value={c.curPic} onPick={c.setPic} />}
      <button type="button" onClick={c.submit} className="h-25 rounded-[12px] border-0 bg-fg text-[15px] font-semibold text-bg">Simpan tugas</button>
    </Sheet>
  )
}
