import { InlineComposer } from '../components/Composer'
import { TaskRow } from '../components/TaskRow'
import { EmptyCard, ProgressBar, SectionLabel, btnSecondary } from '../components/ui'
import { fmt, fmtLong, dow, DAYS, today } from '../lib/dates'
import { byOpen, daysLeftLabel, projectProgress } from '../lib/logic'
import { useStore } from '../store'

/** Welcome card for a new account: three steps that tick themselves off, and can be skipped. */
function Onboarding({ mobile }: { mobile: boolean }) {
  const s = useStore()
  if (!s.account.onboarding) return null
  const guides = s.tasks.filter(t => t.guide && t.status !== 'done').length
  const steps = [
    { done: s.tasks.some(t => !t.guide), title: 'Catat tugas pertama', desc: mobile ? 'Ketuk tombol + di kanan bawah.' : 'Ketik di kolom di atas, lalu tekan Enter.', cta: null as null | { label: string; on: () => void } },
    { done: s.projects.length > 0, title: 'Buat proyek', desc: 'Untuk pekerjaan yang punya tenggat, misalnya tugas kelompok.', cta: { label: 'Buat proyek', on: () => s.go('projects') } },
    { done: s.account.checkedAreas, title: 'Cek area', desc: 'Area yang kamu pilih sudah siap. Tambah atau ubah sesuai kebutuhan.', cta: { label: 'Kelola area', on: () => { s.setAccount({ checkedAreas: true }); s.setUI({ overlay: 'areas' }) } } },
  ]
  return (
    <section aria-label="Selamat datang" className="flex flex-col gap-7 rounded-lg border border-line bg-surface p-9">
      <div className="flex items-start gap-5">
        <div className="flex flex-1 flex-col gap-2">
          <span className="font-display text-[20px] font-semibold">Selamat datang, {s.account.name}</span>
          <span className="text-[13.5px] leading-normal text-fg2">Tiga langkah supaya TaskFlow langsung terpakai.</span>
        </div>
        <button type="button" onClick={() => s.setAccount({ onboarding: false })} className="border-0 bg-transparent p-2 text-[13px] font-medium text-fg3">Lewati</button>
      </div>
      {steps.map((st, i) => (
        <div key={st.title} className="flex items-center gap-6">
          <span className={`grid size-13 flex-none place-items-center rounded-full border-[1.5px] text-[12px] font-semibold ${st.done ? 'border-accent bg-accent text-on-accent' : 'border-line2 text-fg2'}`}>
            {st.done ? '✓' : i + 1}<span className="sr-only">{st.done ? ' selesai' : ''}</span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={`text-[14px] font-medium ${st.done ? 'text-fg3 line-through' : 'text-fg'}`}>{st.title}</span>
            <span className="text-[12.5px] text-fg3">{st.desc}</span>
          </div>
          {st.cta && !st.done && <button type="button" onClick={st.cta.on} className="h-16 whitespace-nowrap rounded-[8px] border border-line2 bg-transparent px-6 text-[13px] font-medium text-fg">{st.cta.label}</button>}
        </div>
      ))}
      {s.tasks.some(t => t.guide) && (
        <div className="flex flex-wrap items-center gap-5 border-t border-line pt-7">
          <span className="min-w-[180px] flex-1 text-[13px] leading-normal text-fg2">{guides > 0 ? `${guides} tugas panduan menunggu di Inbox. Coba langsung di sana.` : 'Semua tugas panduan sudah dicoba.'}</span>
          {guides > 0 && <button type="button" onClick={() => s.go('inbox')} className="h-16 whitespace-nowrap rounded-[8px] border border-line2 bg-transparent px-6 text-[13px] font-medium text-fg">Buka Inbox</button>}
          <button type="button" onClick={s.clearGuides} className="border-0 bg-transparent p-2 text-[13px] font-medium text-fg3">Hapus semua panduan</button>
        </div>
      )}
    </section>
  )
}

export function TodayView({ mobile, onSearchProfile }: { mobile: boolean; onSearchProfile?: React.ReactNode }) {
  const s = useStore()
  const todayT = s.todayTasks
  const overdue = [...s.overdueTasks].sort(byOpen)
  const focus = todayT.filter(t => t.prio === 'high').sort(byOpen)
  const others = todayT.filter(t => t.prio !== 'high').sort(byOpen)
  const done = todayT.filter(t => t.status === 'done').length
  const pct = todayT.length ? Math.round((done / todayT.length) * 100) : 0
  const active = s.projects.filter(p => !p.archived)
  const t0 = today()

  const overdueBlock = overdue.length > 0 && (
    <section aria-label="Terlambat" className={`flex flex-col gap-1 bg-high-soft ${mobile ? 'rounded-xl px-3 pt-6 pb-3' : 'rounded-lg px-6 pt-7 pb-4'}`}>
      <div className={`flex items-center gap-5 ${mobile ? 'px-4 pb-3' : 'px-3 pb-3'}`}>
        <SectionLabel tone="high">TERLAMBAT ({overdue.length})</SectionLabel>
        <span className="flex-1 text-[12.5px] text-fg2">{mobile ? '' : 'Tidak apa-apa. Pindahkan ke hari ini dan lanjutkan.'}</span>
        <button type="button" onClick={s.moveAllOverdue} className="whitespace-nowrap rounded-[8px] border-0 bg-high px-6 py-3.5 text-[12.5px] font-semibold text-white">
          {mobile ? 'Geser semua' : 'Geser semua ke Hari Ini'}
        </button>
      </div>
      {overdue.map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
    </section>
  )

  const lists = todayT.length === 0 ? (
    <EmptyCard title="Hari ini masih kosong" action={<button type="button" onClick={() => s.go('inbox')} className={`${btnSecondary} mt-2`}>Buka Inbox</button>}>
      Tidak ada tugas bertanggal hari ini. {mobile ? 'Catat lewat tombol +' : 'Catat lewat kolom di atas'}, atau beri tanggal pada tugas di Inbox.
    </EmptyCard>
  ) : (
    <>
      <section className="flex flex-col gap-1">
        <div className="flex items-baseline gap-5 px-3 pb-4">
          <SectionLabel>FOKUS UTAMA</SectionLabel>
          {!mobile && <span className="text-[12.5px] text-fg3">Prioritas tinggi — kerjakan ini dulu</span>}
        </div>
        {focus.map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
        {!focus.length && <div className="px-7 py-6 text-[13px] text-fg3">Tidak ada tugas prioritas tinggi hari ini.</div>}
      </section>
      <section className="flex flex-col gap-1">
        <div className="px-3 pb-4"><SectionLabel tone="fg2">{mobile ? 'TUGAS LAIN' : 'TUGAS LAIN HARI INI'} ({others.length})</SectionLabel></div>
        {others.map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
      </section>
    </>
  )

  if (mobile) {
    return (
      <div className="flex flex-col gap-10 px-8 pt-5">
        <div className="flex flex-col gap-6 px-2">
          <div className="flex items-start gap-6">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-[12px] font-medium text-fg3">{DAYS[dow(t0)]}, {fmt(t0)}</span>
              <h1 className="m-0 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]">Hari Ini</h1>
            </div>
            {onSearchProfile}
          </div>
          <div className="flex items-center gap-5">
            <ProgressBar pct={pct} h={4} />
            <span className="whitespace-nowrap text-[12.5px] text-fg2"><span className="font-semibold text-fg">{done}/{todayT.length}</span> selesai</span>
          </div>
        </div>
        {overdueBlock}
        <Onboarding mobile />
        {lists}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[780px] flex-col gap-14">
      <div className="flex items-end gap-10">
        <div className="flex flex-1 flex-col gap-2">
          <span className="font-mono text-[12px] font-medium tracking-[.02em] text-fg3">{fmtLong(t0)}</span>
          <h1 className="text-title-xl m-0">Hari Ini</h1>
        </div>
        <div className="flex flex-col items-end gap-3.5">
          <div className="text-[13px] text-fg2"><span className="font-semibold text-fg">{done}</span> dari {todayT.length} selesai</div>
          <div className="flex w-[160px]"><ProgressBar pct={pct} /></div>
        </div>
      </div>
      <InlineComposer placeholder="Tambah tugas… tekan Enter" />
      {overdueBlock}
      <Onboarding mobile={false} />
      {lists}
      {active.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="px-3"><SectionLabel tone="fg2">PROYEK AKTIF</SectionLabel></div>
          <div className="grid grid-cols-3 gap-6">
            {active.map(p => {
              const pr = projectProgress(p, s.tasks)
              return (
                <button key={p.id} type="button" onClick={() => s.go('project', { projectId: p.id })} className="flex flex-col gap-5 rounded-[12px] border border-line bg-surface p-7 text-left hover:border-line2">
                  <div className="flex w-full items-center gap-4">
                    <span aria-hidden="true" className="size-4 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1 truncate text-[13.5px] font-semibold">{p.name}</span>
                    <span className="font-mono text-[11px] text-fg2">{pr.pct}%</span>
                  </div>
                  <div className="flex w-full"><ProgressBar pct={pr.pct} color={p.color} h={5} /></div>
                  <div className="text-[12px] text-fg3">{daysLeftLabel(p)}</div>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
