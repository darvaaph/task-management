import { useRef, useState } from 'react'
import { PRIO } from '../lib/constants'
import { fmt, rel } from '../lib/dates'
import { areaOf, byOpen } from '../lib/logic'
import { useStore } from '../store'
import { searchShortcut } from '../lib/device'
import { useDialog } from './ui'

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Cari" className="mt-2 grid size-20 place-items-center rounded-full border border-line2 bg-transparent text-fg">
      <SearchIcon />
    </button>
  )
}

/**
 * Searches task titles, notes and project names. Results: TUGAS (max 8, open ones first) and PROYEK (max 5).
 * The first result is highlighted; Enter opens it, Esc closes.
 */
export function Search({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const close = () => s.setUI({ overlay: null })
  useDialog(dialogRef, close)
  const term = q.trim().toLowerCase()
  const tm = term ? s.tasks.filter(t => t.title.toLowerCase().includes(term) || t.notes.toLowerCase().includes(term)).sort(byOpen) : []
  const pm = term ? s.projects.filter(p => p.name.toLowerCase().includes(term)) : []
  const where = (pid: string | null, area: string | null) => (pid ? s.projects.find(p => p.id === pid)?.name ?? 'Inbox' : area ? areaOf(s.areas, area).name : 'Inbox')
  const openTask = (id: string) => s.setUI({ overlay: null, taskId: id })
  const openProject = (id: string) => s.setUI({ overlay: null, view: 'project', projectId: id, taskId: null })
  const first = tm[0] ? () => openTask(tm[0].id) : pm[0] ? () => openProject(pm[0].id) : null

  const rowCls = `flex w-full items-center gap-5 rounded-[8px] border-0 px-5 py-3 text-left text-fg ${mobile ? 'min-h-26' : 'min-h-22'}`
  const hint = !term
    ? mobile ? 'Ketik untuk mencari judul tugas, catatan, atau nama proyek.' : `Ketik untuk mencari judul tugas, catatan, atau nama proyek. Enter membuka hasil teratas. Tekan ${searchShortcut} dari mana saja.`
    : !tm.length && !pm.length ? `Tidak ada yang cocok dengan “${q.trim()}”. Coba kata lain.` : null

  const results = (
    <div className="flex min-h-0 flex-col gap-1 overflow-auto">
      {hint && <div className="p-5 text-[13px] leading-normal text-fg3">{hint}</div>}
      {tm.length > 0 && <span className="text-label px-5 pt-4 pb-2 text-fg3">{tm.length > 8 ? `TUGAS (8 dari ${tm.length})` : `TUGAS (${tm.length})`}</span>}
      {tm.slice(0, 8).map((t, i) => {
        const done = t.status === 'done'
        return (
          <button key={t.id} type="button" onClick={() => openTask(t.id)} className={`${rowCls} ${i === 0 ? 'bg-surface2' : 'bg-transparent hover:bg-hover'}`}>
            <span aria-hidden="true" className="size-4 flex-none rounded-full" style={{ background: PRIO[t.prio].c }} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={`truncate text-[14px] ${done ? 'text-fg3 line-through' : ''}`}>{t.title}</span>
              <span className="truncate text-[12px] text-fg3">{where(t.project, t.area)} · {t.due ? rel(t.due) : 'Tanpa tanggal'}{done ? ' · Selesai' : ''}</span>
            </span>
          </button>
        )
      })}
      {pm.length > 0 && <span className="text-label px-5 pt-5 pb-2 text-fg3">PROYEK</span>}
      {pm.slice(0, 5).map((p, i) => (
        <button key={p.id} type="button" onClick={() => openProject(p.id)} className={`${rowCls} ${!tm.length && i === 0 ? 'bg-surface2' : 'bg-transparent hover:bg-hover'}`}>
          <span aria-hidden="true" className="size-4 flex-none rounded-[3px]" style={{ background: p.color }} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[14px]">{p.name}</span>
            <span className="truncate text-[12px] text-fg3">{areaOf(s.areas, p.area).name}{p.archived ? ' · Diarsipkan' : ' · tenggat ' + fmt(p.due)}</span>
          </span>
        </button>
      ))}
    </div>
  )

  const field = (
    <div className={`flex flex-none items-center gap-5 rounded-[12px] border border-line2 bg-bg px-6 text-fg3 ${mobile ? 'h-23' : 'h-24'}`}>
      <SearchIcon />
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && first?.()}
        placeholder="Cari tugas, catatan, atau proyek…"
        aria-label="Cari"
        className="h-full flex-1 border-0 bg-transparent text-[15px] text-fg outline-none"
      />
      {!mobile && <span className="font-mono text-[11px]">Esc</span>}
    </div>
  )

  if (mobile) {
    return (
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pencarian" className="animate-fade fixed inset-0 z-[12] flex flex-col gap-5 bg-surface px-7 pt-8 pb-10 outline-none">
        <div className="flex items-center gap-4">
          <div className="flex-1">{field}</div>
          <button type="button" onClick={close} className="h-22 border-0 bg-transparent px-3 text-[15px] font-medium text-accent">Batal</button>
        </div>
        {results}
      </div>
    )
  }
  return (
    <>
      <div className="animate-fade fixed inset-0 z-[24] bg-black/25" onClick={close} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pencarian" className="animate-fade fixed top-[90px] left-1/2 z-[25] flex max-h-[560px] w-[600px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)] outline-none">
        {field}
        {results}
      </div>
    </>
  )
}
