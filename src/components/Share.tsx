import { FREE_MEMBER_QUOTA, PEOPLE, PRO_MEMBER_QUOTA } from '../lib/constants'
import { agoLabel, fmt } from '../lib/dates'
import { areaOf } from '../lib/logic'
import type { Project } from '../lib/types'
import { useStore } from '../store'
import { ProBadge } from './Pro'
import { Avatar, Modal, ProgressBar, Sheet } from './ui'

/** Bagikan proyek: invite link, member quota (3 Free / 20 Pro), invite preview, and Pro activity log. */
export function ShareProject({ project: P, mobile }: { project: Project; mobile: boolean }) {
  const s = useStore()
  const close = () => s.setUI({ overlay: null })

  const limit = s.isPro ? PRO_MEMBER_QUOTA : FREE_MEMBER_QUOTA
  const n = P.members.length
  const full = n >= limit
  const tok = P.inviteToken || ('x7' + P.id.slice(0, 3)).padEnd(5, 'q')
  const link = `taskflow.id/invite/${tok}`
  const acts = s.activity.filter(a => a.p === P.id).slice(0, 8)
  const capColor = full ? 'var(--high)' : 'var(--accent)'
  const planTag = s.isPro ? (s.account.demo ? 'Demo' : 'Pro') : 'Gratis'
  const inviteMeta = `${P.area ? areaOf(s.areas, P.area).name + ' · ' : ''}${n} anggota · tenggat ${fmt(P.due)}`

  const copy = () => {
    try {
      navigator.clipboard?.writeText('https://' + link)
    } catch {
      /* clipboard blocked in insecure context */
    }
    s.say('Tautan undangan disalin')
  }

  const linkH = mobile ? 'h-22' : 'h-20'
  const actionH = mobile ? 'h-18' : 'h-16'

  const body = (
    <>
      <div className="flex items-start gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="m-0 font-display text-[20px] font-semibold">Bagikan proyek</h2>
          <span className="truncate text-[13px] text-fg3">{P.name}</span>
        </div>
        <button type="button" onClick={close} className={`${mobile ? 'h-18' : 'h-17'} flex-none rounded-[8px] border-0 bg-fg px-8 text-[13px] font-semibold text-bg`}>Selesai</button>
      </div>

      <section className="flex flex-col gap-4">
        <span className="text-label text-fg3">TAUTAN UNDANGAN</span>
        <div className="flex gap-3">
          <div className={`flex ${linkH} min-w-0 flex-1 items-center rounded-md border border-line2 bg-bg px-6 font-mono text-[13px] font-medium text-fg`}>
            <span className="truncate">{link}</span>
          </div>
          <button type="button" onClick={copy} className={`${linkH} flex-none rounded-md border-0 bg-fg px-8 text-[13px] font-semibold text-bg`}>Salin</button>
        </div>
        <div className="flex items-center gap-5 text-[12.5px] text-fg3">
          <span className="flex-1 leading-[1.45]">Siapa pun yang punya tautan ini bisa bergabung selama kuota masih ada.</span>
          <button type="button" onClick={() => s.resetInviteToken(P.id)} className={`whitespace-nowrap border-0 bg-transparent px-2 text-[12.5px] font-medium text-fg2 hover:text-fg ${mobile ? 'min-h-18' : 'py-2'}`}>Reset tautan</button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="text-label flex-1 text-fg3">ANGGOTA</span>
          <span className={`text-[12.5px] font-medium ${full ? 'text-high' : 'text-accent'}`}>{n} dari {limit} anggota · {planTag}</span>
        </div>
        <div className="flex w-full">
          <ProgressBar pct={Math.min(100, (n / limit) * 100)} color={capColor} h={4} />
        </div>
        <div className="flex flex-col">
          {P.members.map(id => {
            const p = PEOPLE[id]
            if (!p) return null
            const owner = id === 'me'
            const name = owner ? s.account.name : p.name
            const init = owner ? (s.account.name.trim()[0] || 'A').toUpperCase() : p.i
            return (
              <div key={id} className="flex min-h-22 items-center gap-5">
                <Avatar i={init} c={p.c} size={30} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium text-fg">{name}</span>
                  <span className="text-[12px] text-fg3">{owner ? 'Pemilik' : 'Anggota'}</span>
                </div>
                {!owner && (
                  <button type="button" onClick={() => s.removeMember(P.id, id)} className={`${actionH} rounded-[8px] border border-line2 bg-transparent px-5 text-[12.5px] font-medium text-high`}>Keluarkan</button>
                )}
              </div>
            )
          })}
        </div>
        {full && (
          <div className="flex items-center gap-5 rounded-md bg-surface2 px-6 py-5 text-[13px] leading-[1.45] text-fg">
            <span className="flex-1">
              {s.isPro ? `Proyek sudah mencapai ${PRO_MEMBER_QUOTA} anggota.` : `Proyek penuh. Paket Gratis maksimal ${FREE_MEMBER_QUOTA} anggota termasuk Anda. Pro menaikkan batas ke ${PRO_MEMBER_QUOTA}.`}
            </span>
            {!s.isPro && (
              <button type="button" onClick={() => s.openPro('share')} className={`${actionH} whitespace-nowrap rounded-[8px] border-0 bg-accent px-6 text-[12.5px] font-semibold text-on-accent`}>Lihat Pro</button>
            )}
          </div>
        )}
        <button type="button" onClick={() => s.simulateJoin(P.id)} className={`self-start border-0 bg-transparent text-[12.5px] font-medium text-fg2 underline underline-offset-2 hover:text-fg ${mobile ? 'min-h-18 py-2' : 'py-2'}`}>
          Simulasi: teman membuka tautan
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <span className="text-label text-fg3">YANG DILIHAT TEMAN SAAT MEMBUKA TAUTAN</span>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-bg p-9 text-center">
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="size-8 rounded-xs bg-accent" />
            <span className="font-display text-[14px] font-semibold">TaskFlow</span>
          </div>
          <span className="text-[13px] text-fg2">{s.account.name} mengundang Anda ke</span>
          <span className="font-display text-[20px] leading-[1.2] font-semibold">{P.name}</span>
          <span className="text-[12.5px] text-fg3">{inviteMeta}</span>
          {!full ? (
            <>
              <span className="mt-2 inline-block rounded-md bg-fg px-9 py-5 text-[13.5px] font-semibold text-bg">Gabung proyek</span>
              <span className="mt-2 text-[12px] leading-normal text-fg3">Belum punya akun? Teman diminta daftar dulu, lalu otomatis masuk ke proyek ini.</span>
            </>
          ) : (
            <span className="mt-2 rounded-md bg-high-soft px-7 py-5 text-[13px] font-medium text-high">Proyek ini sudah penuh. Hubungi pemiliknya.</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="text-label text-fg3">RIWAYAT AKTIVITAS</span>
          <ProBadge />
        </div>
        {!s.isPro ? (
          <div className="flex items-center gap-5 rounded-md bg-surface2 px-6 py-5 text-[13px] text-fg2">
            <span className="flex-1 leading-[1.45]">Lihat siapa menambah, memindah, dan menyelesaikan tugas.</span>
            <button type="button" onClick={() => s.openPro('share')} className={`whitespace-nowrap border-0 bg-transparent px-2 text-[12.5px] font-semibold text-accent ${mobile ? 'min-h-18' : ''}`}>Lihat Pro</button>
          </div>
        ) : acts.length > 0 ? (
          <div className="flex flex-col">
            {acts.map((a, i) => (
              <div key={`${a.ts}-${i}`} className="flex gap-5 py-2 text-[13px] leading-[1.45]">
                <span className="flex-1 text-fg">{a.text}</span>
                <span className="whitespace-nowrap text-fg3">{agoLabel(a.ts)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[13px] text-fg3">Belum ada aktivitas.</span>
        )}
      </section>
    </>
  )

  return mobile
    ? <Sheet onClose={close} label="Bagikan proyek" maxH="90%">{body}</Sheet>
    : <Modal onClose={close} label="Bagikan proyek" width={500}>{body}</Modal>
}
