import { fmt } from '../lib/dates'
import { useStore } from '../store'
import { IconGoogle, LogoMark } from './icons'
import { Chip, btnPrimary, btnSecondary } from './ui'

/**
 * Invite landing view for `/invite/{token}` (DESIGN §6.25).
 * Never displays the project owner's private area. Covers loading, offline, invalid/rotated,
 * project-full, demo-account prompt, and ready-to-join states.
 */
export function InviteView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const inv = s.inviteState

  const cardCls = mobile
    ? 'flex w-full max-w-[440px] flex-col items-center gap-6 rounded-xl border border-line bg-surface p-9 text-center'
    : 'flex w-full max-w-[440px] flex-col items-center gap-7 rounded-xl border border-line bg-surface p-11 text-center'

  const primaryBtn = mobile ? 'h-24 w-full rounded-[12px] border-0 bg-fg px-8 text-[15px] font-semibold text-bg disabled:opacity-60' : `${btnPrimary} h-21 w-full px-8 text-[14px] disabled:opacity-60`
  const secondaryBtn = mobile ? 'h-22 w-full rounded-[12px] border border-line2 bg-transparent px-7 text-[14px] font-medium text-fg' : `${btnSecondary} h-20 w-full px-7 text-[14px]`

  const logo = (
    <div className="flex items-center gap-4">
      <LogoMark size={22} />
      <span className="font-display text-[17px] font-semibold text-fg">TaskFlow</span>
    </div>
  )

  return (
    <main className="grid min-h-full place-items-center overflow-auto bg-bg px-8 py-12">
      <div className={cardCls}>
        {logo}

        {s.account.demo ? (
          <>
            <h1 className="m-0 font-display text-[22px] leading-tight font-semibold text-fg">Undangan proyek</h1>
            <p className="m-0 text-[13.5px] leading-normal text-fg2">
              Mode Demo hanya memakai data contoh di perangkat ini. Masuk dengan Google untuk bergabung ke proyek sungguhan.
            </p>
            <button
              type="button"
              onClick={() => void s.signInFromInviteDemo()}
              className={`${primaryBtn} flex items-center justify-center gap-4`}
            >
              <IconGoogle size={18} />
              <span>Masuk dengan Google</span>
            </button>
            <button type="button" onClick={s.dismissInvite} className={secondaryBtn}>Kembali ke Mode Demo</button>
          </>
        ) : inv.status === 'loading' || inv.status === 'idle' ? (
          <>
            <h1 className="m-0 font-display text-[20px] font-semibold text-fg">Memuat undangan…</h1>
            <p className="m-0 text-[13px] text-fg3">Memeriksa tautan proyek.</p>
            <button type="button" onClick={s.dismissInvite} className={secondaryBtn}>Batal</button>
          </>
        ) : inv.status === 'offline' ? (
          <>
            <h1 className="m-0 font-display text-[20px] font-semibold text-fg">Tidak tersambung</h1>
            <div role="alert" className="w-full rounded-md bg-high-soft px-7 py-5 text-[13.5px] leading-normal font-medium text-high">
              Butuh koneksi internet untuk bergabung.
            </div>
            <button type="button" onClick={s.retryInvite} className={primaryBtn}>Coba lagi</button>
            <button type="button" onClick={s.dismissInvite} className={secondaryBtn}>Kembali</button>
          </>
        ) : inv.status === 'invalid' ? (
          <>
            <h1 className="m-0 font-display text-[20px] font-semibold text-fg">Tautan tidak berlaku</h1>
            <div role="alert" className="w-full rounded-md bg-surface2 px-7 py-5 text-[13.5px] leading-normal text-fg2">
              Tautan undangan tidak berlaku atau sudah diganti.
            </div>
            <button type="button" onClick={s.dismissInvite} className={primaryBtn}>Kembali ke TaskFlow</button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[13.5px] text-fg2">{inv.ownerName} mengundang kamu ke</span>
              <h1 className="m-0 font-display text-[24px] leading-[1.15] font-semibold text-fg">{inv.projectName}</h1>
              <span className="text-[13px] text-fg3">
                {inv.memberCount} anggota · tenggat {inv.due ? fmt(inv.due) : '—'}
              </span>
            </div>

            {inv.status === 'full' ? (
              <>
                <div role="alert" className="w-full rounded-md bg-high-soft px-7 py-5 text-[13.5px] leading-normal font-medium text-high">
                  Proyek ini sudah penuh. Hubungi pemiliknya.
                </div>
                <button type="button" onClick={s.dismissInvite} className={secondaryBtn}>Kembali ke TaskFlow</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={inv.joining}
                  onClick={() => void s.acceptInvite()}
                  className={primaryBtn}
                >
                  {inv.joining ? 'Bergabung…' : 'Gabung proyek'}
                </button>
                <button type="button" disabled={inv.joining} onClick={s.dismissInvite} className={secondaryBtn}>Nanti saja</button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

/**
 * Post-join personal area picker (DESIGN §6.25, PRD §5.4).
 * Lets the new member place the shared project in one of their own areas (or skip).
 */
/** Shown inline at the top of a just-joined project, so the member still sees the project instead of a blocking dialog. */
export function PickMemberAreaCard({ mobile, projectName }: { mobile: boolean; projectName: string }) {
  const s = useStore()
  return (
    <section aria-label="Pilih area proyek" className={`flex flex-col rounded-lg border border-line bg-surface ${mobile ? 'gap-6 p-8' : 'max-w-[780px] gap-6 p-9'}`}>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-[17px] leading-tight font-semibold">Masukkan ke area mana?</h2>
        <p className="m-0 text-[13.5px] leading-normal text-fg2">
          Pilih area di akun kamu untuk proyek “{projectName}”. Pilihan ini hanya terlihat oleh kamu.
        </p>
      </div>
      <div className={`flex gap-3 ${mobile ? 'flex-col' : 'flex-wrap items-center'}`}>
        {s.areas.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {s.areas.map(a => (
              <Chip key={a.id} size={mobile ? 'lg' : 'md'} dot={a.color} active={false} onClick={() => s.pickJoinedArea(a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="text-[13px] text-fg3">Belum ada area di akun kamu.</span>
        )}
        {!mobile && <span className="flex-1" />}
        <button
          type="button"
          onClick={() => s.pickJoinedArea(null)}
          className={mobile ? 'h-22 rounded-[12px] border border-line2 bg-transparent text-[14px] font-medium text-fg' : btnSecondary}
        >
          Nanti saja
        </button>
      </div>
    </section>
  )
}
