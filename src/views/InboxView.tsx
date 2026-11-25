import { InlineComposer } from '../components/Composer'
import { TaskRow } from '../components/TaskRow'
import { Chip, EmptyCard, SectionLabel } from '../components/ui'
import { byOpen } from '../lib/logic'
import { useStore } from '../store'

export function InboxView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const f = s.ui.inboxArea
  const ok = (a: string | null) => f === 'all' || (f === 'none' ? !a : a === f)
  const loose = s.tasks.filter(t => !t.project && ok(t.area))
  const unsched = loose.filter(t => t.due == null).sort(byOpen)
  const sched = loose
    .filter(t => t.due != null)
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.due!.localeCompare(b.due!) || byOpen(a, b))
  const chips: [string, string, string][] = [['all', 'Semua', 'var(--fg3)'], ['none', 'Tanpa area', 'var(--fg3)'], ...s.areas.map(a => [a.id, a.name, a.color] as [string, string, string])]
  const pad = mobile ? 'px-6' : ''

  return (
    <div className={mobile ? 'flex flex-col gap-8 pt-5' : 'mx-auto flex max-w-[780px] flex-col gap-12'}>
      <div className={`flex flex-col gap-2 ${mobile ? 'px-10' : ''}`}>
        <span className="font-mono text-[12px] font-medium text-fg3">Tugas lepas di luar proyek</span>
        <h1 className={mobile ? 'm-0 font-display text-[32px] leading-[1.05] font-semibold tracking-[-0.02em]' : 'text-title-xl m-0'}>Inbox</h1>
      </div>
      {!mobile && <InlineComposer placeholder="Catat cepat… tanggal bisa diatur nanti" />}
      <div className={`flex gap-4 ${mobile ? 'no-scrollbar overflow-x-auto px-10 pb-1' : 'flex-wrap'}`}>
        {chips.map(([id, label, dot]) => <Chip key={id} size={mobile ? 'lg' : 'md'} dot={dot} active={f === id} onClick={() => s.setUI({ inboxArea: id })}>{label}</Chip>)}
      </div>
      {!loose.length ? (
        <div className={mobile ? 'px-6' : ''}>
          <EmptyCard title="Inbox kosong">
            {f === 'all' ? 'Semua tugas sudah masuk proyek, atau belum ada yang dicatat. Tugas yang dicatat tanpa proyek akan muncul di sini.' : 'Tidak ada tugas lepas di area ini.'}
          </EmptyCard>
        </div>
      ) : (
        <>
          <section className={`flex flex-col gap-1 ${pad}`}>
            <div className="flex items-baseline gap-5 px-3 pb-4">
              <SectionLabel>BELUM DIJADWALKAN ({unsched.length})</SectionLabel>
              {!mobile && <span className="text-[12.5px] text-fg3">Beri tanggal agar muncul di Hari Ini dan Jadwal</span>}
            </div>
            {unsched.map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
            {!unsched.length && <div className="px-7 py-6 text-[13px] text-fg3">Semua tugas lepas sudah punya tanggal.</div>}
          </section>
          <section className={`flex flex-col gap-1 ${pad}`}>
            <div className="px-3 pb-4"><SectionLabel tone="fg2">TERJADWAL ({sched.length})</SectionLabel></div>
            {sched.map(t => <TaskRow key={t.id} task={t} compact={mobile} />)}
          </section>
        </>
      )}
    </div>
  )
}
