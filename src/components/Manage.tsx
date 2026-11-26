import { useState, type ReactNode } from 'react'
import { AREA_COLORS } from '../lib/constants'
import type { Project } from '../lib/types'
import { useStore } from '../store'
import { Chip, Modal, Sheet } from './ui'

const lbl = 'text-label text-fg3'
const field = 'rounded-[8px] border border-line bg-bg px-5 text-[14px] text-fg outline-none'
const dateInput = 'h-18 rounded-[8px] border border-line2 bg-bg px-4 text-[13px] font-medium text-fg'

function Frame({ mobile, label, onClose, children, width }: { mobile: boolean; label: string; onClose: () => void; children: ReactNode; width: number }) {
  return mobile
    ? <Sheet onClose={onClose} label={label} maxH="86%">{children}</Sheet>
    : <Modal onClose={onClose} label={label} width={width}>{children}</Modal>
}

function Header({ title, onDone, note }: { title: string; onDone: () => void; note: string }) {
  return (
    <>
      <div className="flex items-center gap-5">
        <h2 className="m-0 flex-1 font-display text-[20px] font-semibold">{title}</h2>
        <button type="button" onClick={onDone} className="h-17 rounded-[8px] border-0 bg-fg px-8 text-[13px] font-semibold text-bg">Selesai</button>
      </div>
      <div className="-mt-4 text-[12.5px] leading-normal text-fg3">{note}</div>
    </>
  )
}

/** Kelola proyek: name, area, dates, sections, archive, delete. Everything saves as you type; Selesai only closes. */
export function ManageProject({ project: P, mobile }: { project: Project; mobile: boolean }) {
  const s = useStore()
  const [newSec, setNewSec] = useState('')
  const [confirm, setConfirm] = useState(false)
  const close = () => s.setUI({ overlay: null })
  const pt = s.tasks.filter(t => t.project === P.id)
  const owner = s.isOwner(P)
  const addSec = () => {
    const n = newSec.trim()
    if (!n || P.sections.includes(n)) return
    s.addSection(P.id, n)
    setNewSec('')
  }
  const h = mobile ? 'h-22' : 'h-18'

  return (
    <Frame mobile={mobile} label="Kelola proyek" onClose={close} width={480}>
      <Header
        title="Kelola proyek"
        onDone={close}
        note={owner ? 'Perubahan langsung tersimpan.' : 'Area ini hanya berlaku di akunmu. Pengaturan lain dikelola pemilik proyek.'}
      />
      {owner && (
        <label className="flex flex-col gap-4">
          <span className={lbl}>NAMA</span>
          <input value={P.name} onChange={e => s.updateProject(P.id, { name: e.target.value })} onBlur={s.flushWrites} aria-label="Nama proyek" className={`${mobile ? 'h-24' : 'h-21'} rounded-md border border-line2 bg-bg px-7 text-[15px] font-medium text-fg outline-none`} />
        </label>
      )}
      <div className="flex flex-col gap-4">
        <span className={lbl}>AREA</span>
        <div className="flex flex-wrap gap-3">
          {[...s.areas.map(a => ({ id: a.id as string | null, name: a.name, color: a.color })), { id: null, name: 'Tanpa area', color: 'var(--fg3)' }].map(a => (
            <Chip key={a.id ?? 'none'} size="lg" dot={a.color} active={(P.area ?? null) === a.id} onClick={() => s.updateProject(P.id, owner ? { area: a.id, color: a.id ? a.color : P.color } : { area: a.id })}>{a.name}</Chip>
          ))}
        </div>
      </div>
      {owner && (
        <>
          <div className="flex flex-wrap gap-6">
            <label className="flex flex-col gap-4">
              <span className={lbl}>MULAI</span>
              <input type="date" value={P.start} onChange={e => { const v = e.target.value; if (v) s.updateProject(P.id, { start: v, due: v > P.due ? v : P.due }) }} aria-label="Tanggal mulai" className={dateInput} />
            </label>
            <label className="flex flex-col gap-4">
              <span className={lbl}>TENGGAT</span>
              <input type="date" value={P.due} onChange={e => { const v = e.target.value; if (v) s.updateProject(P.id, { due: v, start: v < P.start ? v : P.start }) }} aria-label="Tanggal tenggat" className={dateInput} />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <span className={lbl}>BAGIAN</span>
            {P.sections.map(sc => (
              <SectionRow key={sc} name={sc} count={pt.filter(t => t.section === sc).length} h={h} onRename={n => s.renameSection(P.id, sc, n)} onDelete={() => s.deleteSection(P.id, sc)} />
            ))}
            {!P.sections.length && <span className="text-[12.5px] text-fg3">Belum ada bagian. Tugas ditampilkan dalam satu daftar.</span>}
            <div className="flex gap-3">
              <input value={newSec} onChange={e => setNewSec(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSec()} placeholder="Bagian baru, misalnya Revisi" aria-label="Nama bagian baru" className={`min-w-0 flex-1 ${h} rounded-[8px] border border-dashed border-line2 bg-transparent px-5 text-[14px] text-fg outline-none`} />
              <button type="button" onClick={addSec} className={`${h} rounded-[8px] border border-line2 bg-transparent px-6 text-[13px] font-medium text-fg`}>Tambah</button>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-7">
            <button type="button" onClick={() => (P.archived ? void s.restoreProject(P) : s.archiveProject(P))} className="h-21 rounded-md border border-line2 bg-transparent text-[14px] font-medium text-fg">
              {P.archived ? 'Kembalikan dari arsip' : 'Arsipkan proyek'}
            </button>
            {!confirm ? (
              <button type="button" onClick={() => setConfirm(true)} className="h-21 w-full rounded-md border border-line2 bg-transparent text-[14px] font-medium text-high">Hapus proyek</button>
            ) : (
              <div role="alert" className="flex flex-col gap-4 rounded-md bg-high-soft p-6">
                <span className="text-[13px] leading-[1.45] text-fg">
                  {pt.length ? `Hapus "${P.name}" beserta ${pt.length} tugasnya?` : `Hapus "${P.name}"?`} Anda masih bisa mengurungkannya beberapa detik setelah ini.
                </span>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setConfirm(false)} className="h-19 flex-1 rounded-[8px] border border-line2 bg-surface text-[13px] font-medium text-fg">Batal</button>
                  <button type="button" onClick={() => s.deleteProject(P)} className="h-19 flex-1 rounded-[8px] border-0 bg-high text-[13px] font-semibold text-white">Ya, hapus</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Frame>
  )
}

/** Renames on blur/Enter, so typing doesn't rename the section (and its tasks) letter by letter. */
function SectionRow({ name, count, h, onRename, onDelete }: { name: string; count: number; h: string; onRename: (n: string) => void; onDelete: () => void }) {
  const [v, setV] = useState(name)
  const commit = () => { const n = v.trim(); if (n && n !== name) onRename(n); else setV(name) }
  return (
    <div className="flex items-center gap-3">
      <input value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Nama bagian" className={`min-w-0 flex-1 ${h} ${field}`} />
      <span className="min-w-[52px] text-right font-mono text-[11px] text-fg3">{count} tugas</span>
      <button type="button" onClick={onDelete} aria-label={`Hapus bagian ${name}`} className="size-18 rounded-[8px] border-0 bg-transparent text-[15px] text-fg3 hover:bg-hover">✕</button>
    </div>
  )
}

/** Kelola area: colour (tap to cycle), name, counts, delete. Deleting a used area asks first; its items become "Tanpa area". */
export function ManageAreas({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const close = () => s.setUI({ overlay: null })
  const add = () => { const n = name.trim(); if (!n) return; s.addArea(n); setName('') }

  return (
    <Frame mobile={mobile} label="Kelola area" onClose={close} width={480}>
      <Header title="Kelola area" onDone={close} note="Area memisahkan bidang hidup yang berjalan terus, seperti kuliah, kerja, dan rumah. Ketuk titik warna untuk menggantinya." />
      <div className="flex flex-col gap-3">
        {s.areas.map(a => {
          const nt = s.tasks.filter(t => !t.project && t.area === a.id).length
          const np = s.projects.filter(p => p.area === a.id).length
          const next = AREA_COLORS[(AREA_COLORS.indexOf(a.color) + 1) % AREA_COLORS.length]
          return (
            <div key={a.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => s.updateArea(a.id, { color: next })} aria-label={`Ganti warna area ${a.name}`} className="grid size-18 flex-none place-items-center rounded-[8px] border border-line bg-transparent">
                  <span aria-hidden="true" className="size-7 rounded-[4px]" style={{ background: a.color }} />
                </button>
                <input value={a.name} onChange={e => s.updateArea(a.id, { name: e.target.value })} onBlur={s.flushWrites} aria-label="Nama area" className={`h-18 min-w-0 flex-1 ${field}`} />
                <span className="min-w-[70px] text-right font-mono text-[11px] text-fg3">{nt} tugas · {np} proyek</span>
                <button type="button" onClick={() => (nt || np ? setConfirm(a.id) : s.deleteArea(a))} aria-label={`Hapus area ${a.name}`} className="size-18 rounded-[8px] border-0 bg-transparent text-[15px] text-fg3 hover:bg-hover">✕</button>
              </div>
              {confirm === a.id && (
                <div role="alert" className="flex items-center gap-4 rounded-md bg-high-soft px-6 py-5 text-[13px] text-fg">
                  <span className="flex-1 leading-[1.4]">{nt} tugas dan {np} proyek akan menjadi tanpa area.</span>
                  <button type="button" onClick={() => setConfirm(null)} className="h-16 rounded-[8px] border border-line2 bg-surface px-5 text-[12.5px] font-medium text-fg">Batal</button>
                  <button type="button" onClick={() => { setConfirm(null); s.deleteArea(a) }} className="h-16 rounded-[8px] border-0 bg-high px-5 text-[12.5px] font-semibold text-white">Hapus</button>
                </div>
              )}
            </div>
          )
        })}
        {!s.areas.length && <span className="text-[13px] text-fg3">Belum ada area.</span>}
      </div>
      <div className="flex gap-3">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Area baru, misalnya Organisasi" aria-label="Nama area baru" className="h-20 min-w-0 flex-1 rounded-md border border-dashed border-line2 bg-transparent px-6 text-[14px] text-fg outline-none" />
        <button type="button" onClick={add} className="h-20 rounded-md border-0 bg-fg px-8 text-[13px] font-semibold text-bg">Tambah</button>
      </div>
    </Frame>
  )
}
