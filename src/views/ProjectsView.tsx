import { useState } from 'react'
import { Avatar, Chip, EmptyCard, Modal, ProgressBar, Segmented, Sheet, btnPrimary } from '../components/ui'
import { FREE_PROJECT_QUOTA, PEOPLE } from '../lib/constants'
import { addDays, fmt, today } from '../lib/dates'
import { areaOf, daysLeftLabel, projectProgress } from '../lib/logic'
import type { Project } from '../lib/types'
import { useStore } from '../store'

export function ProjectsView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const [np, setNp] = useState(false)
  const { projArea: area, archives } = s.ui
  const owned = s.projects.filter(p => !p.archived).length
  const cards = s.projects.filter(p => p.archived === archives && (area === 'all' || p.area === area))
  const chips: [string, string, string][] = [['all', 'Semua', 'var(--fg3)'], ...s.areas.map(a => [a.id, a.name, a.color] as [string, string, string])]
  const quota = s.isPro ? `${owned} proyek aktif · ${s.account.demo ? 'Demo' : 'Pro'}` : `${owned}/${FREE_PROJECT_QUOTA} proyek aktif · Gratis`
  const emptyText = archives
    ? 'Belum ada proyek yang diarsipkan. Proyek yang selesai bisa diarsipkan supaya tidak menghabiskan kuota.'
    : area !== 'all' ? 'Belum ada proyek di area ini.' : 'Belum ada proyek. Proyek cocok untuk pekerjaan yang punya tenggat, misalnya tugas kelompok atau persiapan acara.'

  const list = (
    <>
      {cards.length > 0 && (
        <div className={mobile ? 'flex flex-col gap-5 px-8' : 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-7'}>
          {cards.map(p => <ProjectCard key={p.id} p={p} mobile={mobile} />)}
        </div>
      )}
      {!cards.length && (
        <div className={mobile ? 'px-8' : ''}>
          <EmptyCard action={!archives && <button type="button" onClick={() => setNp(true)} className={btnPrimary}>+ Proyek baru</button>}>{emptyText}</EmptyCard>
        </div>
      )}
      {np && <NewProject mobile={mobile} onClose={() => setNp(false)} />}
    </>
  )

  const chipRow = (
    <div className={`flex gap-4 ${mobile ? 'no-scrollbar overflow-x-auto px-10 pb-1' : 'flex-wrap'}`}>
      {chips.map(([id, label, dot]) => <Chip key={id} size={mobile ? 'lg' : 'md'} dot={dot} active={area === id} onClick={() => s.setUI({ projArea: id })}>{label}</Chip>)}
    </div>
  )

  if (mobile) {
    return (
      <div className="flex flex-col gap-8 pt-5">
        <div className="flex items-start gap-6 px-10">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="font-mono text-[12px] font-medium text-fg3">{quota}</span>
            <h1 className="m-0 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]">Proyek</h1>
          </div>
          <button type="button" aria-pressed={archives} onClick={() => s.setUI({ archives: !archives })} className={`mt-4 h-18 rounded-pill border border-line2 px-6 text-[13px] font-medium text-fg ${archives ? 'bg-surface2' : 'bg-transparent'}`}>Arsip</button>
          <button type="button" onClick={() => setNp(true)} className="mt-4 h-18 rounded-pill border-0 bg-fg px-7 text-[13px] font-semibold text-bg">+ Baru</button>
        </div>
        {chipRow}
        {list}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-12">
      <div className="flex items-end gap-8">
        <div className="flex flex-1 flex-col gap-2">
          <span className="font-mono text-[12px] font-medium text-fg3">{quota}</span>
          <h1 className="text-title-xl m-0">Proyek</h1>
        </div>
        <Segmented value={archives ? 'arch' : 'active'} onChange={v => s.setUI({ archives: v === 'arch' })} options={[{ value: 'active', label: 'Aktif' }, { value: 'arch', label: 'Arsip' }]} />
        <button type="button" onClick={() => setNp(true)} className={btnPrimary}>+ Proyek baru</button>
      </div>
      {chipRow}
      {list}
    </div>
  )
}

function ProjectCard({ p, mobile }: { p: Project; mobile: boolean }) {
  const s = useStore()
  const pr = projectProgress(p, s.tasks)
  const a = areaOf(s.areas, p.area)
  const open = () => s.go('project', { projectId: p.id })
  const avatars = (
    <div className="flex pl-3">
      {p.members.map(m => <span key={m} className="-ml-3"><Avatar i={PEOPLE[m].i} c={PEOPLE[m].c} size={mobile ? 22 : 24} ring="var(--surface)" /></span>)}
    </div>
  )
  if (mobile) {
    return (
      <button type="button" onClick={open} className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-8 text-left">
        <div className="flex w-full items-center gap-4">
          <span aria-hidden="true" className="size-4.5 rounded-full" style={{ background: p.color }} />
          <span className="flex-1 font-display text-[16px] font-semibold">{p.name}</span>
          <span className="text-[12px] text-fg3">{daysLeftLabel(p)}</span>
        </div>
        <div className="flex w-full items-center gap-5"><ProgressBar pct={pr.pct} color={p.color} /><span className="font-mono text-[12px] font-semibold">{pr.pct}%</span></div>
        <div className="flex w-full items-center gap-4 text-[12px] text-fg3">
          <span className="rounded-[6px] bg-surface2 px-4 py-1.5 text-fg2">{a.name}</span>
          <span>{pr.done}/{pr.total} tugas</span>
          <span className="flex-1" />
          {avatars}
        </div>
      </button>
    )
  }
  return (
    <button type="button" onClick={open} className="flex flex-col gap-7 rounded-lg border border-line bg-surface p-9 text-left transition-colors hover:border-line2">
      <div className="flex w-full items-center gap-4">
        <span className="flex items-center gap-3 rounded-[6px] bg-surface2 px-4 py-1.5 text-[11.5px] font-medium text-fg2">
          <span aria-hidden="true" className="size-3 rounded-[2px]" style={{ background: a.color }} />{a.name}
        </span>
        <span className="flex-1" />
        <span className="text-[12px] text-fg3">{daysLeftLabel(p)}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="font-display text-[18px] font-semibold tracking-[-0.01em]">{p.name}</div>
        <div className="text-[12.5px] text-fg3">{pr.done}/{pr.total} tugas · tenggat {fmt(p.due)}</div>
      </div>
      <div className="flex w-full items-center gap-5"><ProgressBar pct={pr.pct} color={p.color} /><span className="font-mono text-[12px] font-semibold">{pr.pct}%</span></div>
      <div className="flex items-center gap-4">
        {avatars}
        <span className="ml-4 text-[12px] text-fg3">{p.members.length > 1 ? `Bersama · ${p.members.length} anggota` : 'Pribadi'}</span>
      </div>
    </button>
  )
}

function NewProject({ mobile, onClose }: { mobile: boolean; onClose: () => void }) {
  const s = useStore()
  const [name, setName] = useState('')
  const [area, setArea] = useState<string>(s.ui.projArea !== 'all' ? s.ui.projArea : s.areas[0]?.id ?? '')
  const [weeks, setWeeks] = useState(2)
  const owned = s.projects.filter(p => !p.archived).length
  const full = !s.isPro && owned >= FREE_PROJECT_QUOTA
  const ok = !full && name.trim().length > 0
  const submit = () => {
    if (full) { onClose(); s.openPro('proj'); return }
    if (!ok) return
    s.createProject(name.trim(), area || null, addDays(today(), weeks * 7))
    onClose()
  }
  const lbl = 'text-label text-fg3'
  const body = (
    <>
      <div className="font-display text-[20px] font-semibold">Proyek baru</div>
      <label className="flex flex-col gap-4">
        <span className={lbl}>NAMA</span>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Misalnya Tugas Kelompok Statistik" className="h-22 rounded-md border border-line2 bg-bg px-7 text-[15px] font-medium text-fg outline-none" />
      </label>
      <div className="flex flex-col gap-4">
        <span className={lbl}>AREA</span>
        <div className="flex flex-wrap gap-3">{s.areas.map(a => <Chip key={a.id} size={mobile ? 'lg' : 'md'} dot={a.color} active={area === a.id} onClick={() => setArea(a.id)}>{a.name}</Chip>)}</div>
      </div>
      <div className="flex flex-col gap-4">
        <span className={lbl}>TENGGAT</span>
        <div className="flex flex-wrap gap-3">{[1, 2, 3].map(w => <Chip key={w} size={mobile ? 'lg' : 'md'} active={weeks === w} onClick={() => setWeeks(w)}>{`${w} minggu · ${fmt(addDays(today(), w * 7))}`}</Chip>)}</div>
      </div>
      <div className={`text-[12.5px] ${full ? 'text-high' : 'text-fg3'}`}>
        {full ? `Kuota ${FREE_PROJECT_QUOTA} proyek aktif penuh. Arsipkan proyek lain, atau buka batasnya dengan Pro.` : s.isPro ? 'Proyek aktif tanpa batas.' : `${owned} dari ${FREE_PROJECT_QUOTA} slot proyek aktif terpakai.`}
      </div>
      <div className="flex gap-4">
        <button type="button" onClick={onClose} className="h-21 rounded-md border border-line2 bg-transparent px-8 text-[14px] font-medium text-fg">Batal</button>
        <button type="button" onClick={submit} disabled={!ok && !full} className="h-21 flex-1 rounded-md border-0 bg-fg text-[14px] font-semibold text-bg disabled:opacity-40">{full ? 'Kuota penuh · Lihat Pro' : 'Buat proyek'}</button>
      </div>
    </>
  )
  return mobile ? <Sheet onClose={onClose} label="Proyek baru">{body}</Sheet> : <Modal onClose={onClose} label="Proyek baru">{body}</Modal>
}
