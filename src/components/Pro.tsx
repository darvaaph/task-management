import type { Project } from '../lib/types'
import { useStore, type ProCtx } from '../store'
import { Modal, Sheet } from './ui'

export const ProBadge = ({ label = 'PRO' }: { label?: string }) => (
  <span className="rounded-[4px] bg-accent-soft px-2.5 py-1 font-mono text-[9.5px] font-semibold tracking-[.06em] text-accent">{label}</span>
)

const CTX: Partial<Record<ProCtx, string>> = {
  tl: 'Timeline termasuk di Pro. Lihat semua proyek dalam satu linimasa dan geser jadwalnya langsung.',
  rec: 'Pengulangan Hari kerja dan Bulanan termasuk di Pro. Harian dan Mingguan tetap gratis.',
  dur: 'Durasi tugas termasuk di Pro, supaya blok di tampilan Mingguan sesuai lama pengerjaan.',
  proj: 'Paket Gratis dibatasi 5 proyek aktif. Pro membuka batas ini.',
  accent: 'Warna aksen selain Indigo termasuk di Pro.',
  rem: 'Pengingat ganda termasuk di Pro, misalnya H-1 dan 30 menit sebelum tenggat.',
  share: 'Pro menaikkan batas anggota proyek bersama dari 3 ke 20 dan membuka riwayat aktivitas.',
}

const ROWS: [string, string, string, string][] = [
  ['proj', 'Proyek aktif', '5', 'Tanpa batas'],
  ['tl', 'Tampilan Timeline', '—', '✓'],
  ['rec', 'Tugas berulang', 'Harian, mingguan', '+ Hari kerja, bulanan'],
  ['dur', 'Durasi tugas', '—', '✓'],
  ['share', 'Anggota proyek bersama', '3', '20 + riwayat'],
  ['rem', 'Pengingat per tugas', '1', 'Beberapa'],
  ['accent', 'Warna aksen', 'Indigo', '4 pilihan'],
  ['gcal', 'Overlay Google Calendar', '—', '✓'],
]

/** Layar Pro: context box, Fitur | Gratis | Pro table, price and Beli Pro. Buying is a simulation. */
export function ProScreen({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const ctx = s.ui.pro
  const close = () => s.setUI({ pro: null })
  const owned = s.account.plan === 'pro'
  const cell = 'border-t border-line px-5 py-4.5'
  const body = (
    <>
      <div className="flex items-start gap-5">
        <div className="flex flex-1 flex-col items-start gap-3">
          <ProBadge />
          <h2 className="m-0 font-display text-[26px] leading-[1.1] font-semibold tracking-[-0.01em]">TaskFlow Pro</h2>
          <span className="text-[14px] text-fg2">Sekali bayar, aktif selamanya di semua perangkat.</span>
        </div>
        <button type="button" onClick={close} aria-label="Tutup" className="size-17 flex-none rounded-[8px] border-0 bg-surface2 text-[14px] text-fg2">✕</button>
      </div>
      {ctx && CTX[ctx] && <div className="rounded-md bg-accent-soft px-6 py-5 text-[13.5px] leading-[1.45] text-fg">{CTX[ctx]}</div>}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,1fr)] overflow-hidden rounded-[12px] border border-line text-[13px]">
        <span className="text-label bg-surface2 px-6 py-4.5 text-fg3">FITUR</span>
        <span className="text-label bg-surface2 px-5 py-4.5 text-fg3">GRATIS</span>
        <span className="text-label bg-surface2 px-5 py-4.5 text-accent">PRO</span>
        {ROWS.map(([id, f, free, pro]) => {
          const hl = id === ctx ? 'bg-accent-soft font-semibold' : ''
          return [
            <span key={id + 'f'} className={`${cell} px-6 ${hl}`}>{f}</span>,
            <span key={id + 'g'} className={`${cell} text-fg2 ${hl}`}>{free}</span>,
            <span key={id + 'p'} className={`${cell} font-semibold ${hl}`}>{pro}</span>,
          ]
        })}
      </div>
      {owned ? (
        <div className="rounded-[12px] bg-surface2 px-7 py-6 text-[13.5px] leading-normal text-fg">Pro sudah aktif di akun ini. Terima kasih sudah mendukung TaskFlow.</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-4">
            <span className="font-display text-[28px] font-semibold">Rp99.000</span>
            <span className="text-[13px] text-fg3">sekali bayar · harga contoh</span>
          </div>
          <button type="button" onClick={s.buyPro} className="h-24 rounded-[12px] border-0 bg-accent text-[15px] font-semibold text-on-accent">Beli Pro</button>
          <button type="button" onClick={close} className="h-20 rounded-md border-0 bg-transparent text-[14px] font-medium text-fg2">Nanti saja</button>
          <span className="text-center text-[12px] leading-normal text-fg3">Bayar lewat web atau Google Play (Android). Status Pro tersimpan di akun, jadi aktif juga di HP dan laptop lain.</span>
        </div>
      )}
    </>
  )
  return mobile
    ? <Sheet onClose={close} label="TaskFlow Pro" maxH="92%" elevated>{body}</Sheet>
    : <Modal onClose={close} label="TaskFlow Pro" width={560} elevated>{body}</Modal>
}

/** Shown in place of a Pro view for free accounts: the feature stays visible, with a way to upgrade (or owner-plan info for members). */
export function ProLocked({ ctx, project }: { ctx: ProCtx; project?: Project }) {
  const s = useStore()
  const byOwner = !s.canUpgradeFor(project)
  return (
    <div className="grid min-h-[260px] flex-1 place-items-center rounded-lg border border-dashed border-line2 bg-surface px-11 py-16">
      <div className="flex max-w-[380px] flex-col items-center gap-6 text-center">
        <div aria-hidden="true" className="mb-2 flex w-[220px] flex-col gap-3.5 rounded-[12px] bg-bg p-7">
          <span className="h-6 w-[62%] rounded-[4px] bg-area-kuliah opacity-75" />
          <span className="ml-[28%] h-6 w-[40%] rounded-[4px] bg-area-kantor opacity-75" />
          <span className="ml-[42%] h-6 w-[55%] rounded-[4px] bg-area-pribadi opacity-75" />
        </div>
        <ProBadge />
        <div className="font-display text-[20px] leading-tight font-semibold">Lihat semua proyek dalam satu linimasa</div>
        <div className="text-[13.5px] leading-normal text-fg2">
          {byOwner
            ? 'Geser jadwal proyek, ubah durasi, dan temukan tenggat yang bertabrakan.'
            : 'Geser jadwal proyek, ubah durasi, dan temukan tenggat yang bertabrakan. Termasuk di TaskFlow Pro, sekali bayar.'}
        </div>
        {byOwner ? (
          <p className="m-0 rounded-md bg-surface2 px-6 py-4 text-[13px] font-medium text-fg2">Fitur ini mengikuti paket pemilik proyek.</p>
        ) : (
          <button type="button" onClick={() => s.openPro(ctx, project)} className="mt-2 h-21 rounded-md border-0 bg-accent px-10 text-[14px] font-semibold text-on-accent">Lihat TaskFlow Pro</button>
        )}
      </div>
    </div>
  )
}

const ACCENTS = [
  { id: 'indigo', name: 'Indigo', c: 'oklch(0.5 0.16 265)' },
  { id: 'teal', name: 'Teal', c: 'oklch(0.47 0.16 195)' },
  { id: 'tangerine', name: 'Tangerine', c: 'oklch(0.5 0.16 45)' },
  { id: 'forest', name: 'Forest', c: 'oklch(0.5 0.16 150)' },
] as const

/** Warna aksen: Indigo is free; the others open the Pro screen for free accounts. */
export function AccentPicker() {
  const s = useStore()
  return (
    <div role="group" aria-label="Warna aksen" className="flex gap-4">
      {ACCENTS.map(a => {
        const on = s.account.accent === a.id
        const locked = a.id !== 'indigo' && !s.isPro
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            aria-label={locked ? `${a.name} (Pro)` : a.name}
            onClick={() => (locked ? s.openPro('accent') : s.setAccount({ accent: a.id }))}
            className="grid size-15 place-items-center rounded-full border-2 bg-transparent p-0"
            style={{ borderColor: on ? 'var(--fg)' : 'transparent' }}
          >
            <span aria-hidden="true" className="size-10 rounded-full" style={{ background: a.c, opacity: locked ? 0.4 : 1 }} />
          </button>
        )
      })}
    </div>
  )
}
