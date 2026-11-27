import { useState } from 'react'
import { IconGoogle, LogoMark } from '../components/icons'
import { Chip } from '../components/ui'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS } from '../lib/constants'
import { useStore } from '../store'

function AuthLogo({ size }: { size: number }) {
  return (
    <div className="flex items-center gap-5">
      <LogoMark size={size} />
      <span className="font-display font-semibold" style={{ fontSize: size - 4 }}>TaskFlow</span>
    </div>
  )
}

const HERO_AREAS = AREA_PRESETS.slice(0, 3).map((a, i) => ({ ...a, color: AREA_COLORS[i] }))

/**
 * Sign-in screen (Google only; Mode Demo opens from the /demo link) and first-login starting area picker (DESIGN §6.20, §6.29).
 */
export function AuthView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const [picked, setPicked] = useState<string[]>(DEFAULT_AREA_IDS)
  const [areaErr, setAreaErr] = useState('')

  const err = s.needsAreas ? (areaErr || s.authError) : s.authError

  const submitAreas = () => {
    if (!picked.length) return setAreaErr('Pilih minimal satu area.')
    setAreaErr('')
    void s.completeSetup(picked)
  }

  const h = mobile ? 'h-25 rounded-[12px] text-[15px]' : 'h-23 rounded-md text-[14px]'
  const primary = `${h} flex items-center justify-center gap-4 border-0 bg-fg px-8 font-semibold text-bg disabled:opacity-60`
  const link = 'border-0 bg-transparent p-2 text-[13px] font-medium text-accent disabled:opacity-50'
  const errBox = err && <div role="alert" className="rounded-[8px] bg-high-soft px-6 py-4.5 text-[13px] text-high">{err}</div>
  const head = (title: string, sub: string) => (
    <>
      <h1 className={`m-0 font-display font-semibold tracking-[-0.01em] ${mobile ? 'text-[24px]' : 'text-[28px]'}`}>{title}</h1>
      <p className="m-0 -mt-2 mb-2 text-[14px] leading-normal text-fg2">{sub}</p>
    </>
  )

  const form = (
    <div className="flex flex-col gap-7">
      {!s.needsAreas ? (
        <>
          {head('Masuk ke TaskFlow', 'Lanjutkan ke tugas dan proyekmu.')}
          {s.inviteToken && (
            <div className="rounded-[8px] bg-accent-soft px-6 py-4.5 text-[13px] leading-normal text-fg">
              Masuk dengan Google untuk membuka undangan proyek.
            </div>
          )}
          {errBox}
          <button
            type="button"
            disabled={s.authBusy}
            onClick={() => void s.signInWithGoogle()}
            className={primary}
          >
            <IconGoogle size={18} />
            <span>{s.authBusy ? (s.authStatus || 'Menghubungkan…') : 'Lanjutkan dengan Google'}</span>
          </button>
          <p className="m-0 -mt-3 text-center text-[12.5px] leading-normal text-fg3">
            Gunakan akun Google pribadi. Akun sekolah atau kampus kadang diblokir oleh admin.
          </p>
        </>
      ) : (
        <>
          {head('Pilih area yang kamu jalani', 'Area memisahkan bidang hidup, misalnya kuliah dan kerja. Bisa diubah kapan saja di Kelola area.')}
          {errBox}
          <div role="group" aria-label="Area awal" className="flex flex-wrap gap-4">
            {AREA_PRESETS.map((a, i) => (
              <Chip
                key={a.id}
                size="lg"
                dot={AREA_COLORS[i]}
                active={picked.includes(a.id)}
                onClick={() => {
                  setAreaErr('')
                  s.clearAuthError()
                  setPicked(p => (p.includes(a.id) ? p.filter(x => x !== a.id) : [...p, a.id]))
                }}
              >
                {a.name}
              </Chip>
            ))}
          </div>
          <button type="button" disabled={s.authBusy} onClick={submitAreas} className={primary}>
            {s.authBusy ? (s.authStatus || 'Menyimpan…') : 'Lanjut'}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" disabled={s.authBusy} onClick={() => void s.signOut()} className={link}>‹ Kembali</button>
            <button type="button" disabled={s.authBusy} onClick={() => void s.completeSetup(DEFAULT_AREA_IDS)} className={link}>Lewati</button>
          </div>
        </>
      )}
    </div>
  )

  const heroAreas = s.areas.length >= 3 ? s.areas.slice(0, 3) : HERO_AREAS

  if (mobile) {
    return (
      <main className="flex min-h-full flex-col gap-7 overflow-auto bg-bg px-13 pt-12 pb-20">
        <AuthLogo size={22} />
        <div className="flex min-h-[180px] flex-1 flex-col justify-center gap-6">
          <div className="font-display text-[36px] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">Catat cepat. Fokus pada yang penting.</div>
          <div className="text-[15px] leading-normal text-fg2">Untuk kuliah, kerja, dan rumah.</div>
        </div>
        {form}
      </main>
    )
  }

  return (
    <main className="grid h-full grid-cols-2">
      <div className="flex flex-col justify-between bg-fg p-28 text-bg">
        <AuthLogo size={24} />
        <div className="flex max-w-[460px] flex-col gap-9">
          <div className="font-display text-[46px] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">Catat cepat. Fokus pada yang penting hari ini.</div>
          <div className="text-[16px] leading-[1.55] opacity-75">Hari Ini, Inbox, Jadwal, dan Proyek dalam satu aplikasi ringan untuk kuliah, kerja, dan rumah.</div>
        </div>
        <div className="flex gap-4">
          {heroAreas.map(a => (
            <span key={a.id} className="flex items-center gap-3.5 rounded-pill border border-current px-6 py-3.5 text-[13px] opacity-80">
              <span aria-hidden="true" className="size-4 rounded-[2px]" style={{ background: a.color }} />{a.name}
            </span>
          ))}
        </div>
      </div>
      <div className="grid place-items-center overflow-auto bg-bg p-20">
        <div className="w-[360px] max-w-full">{form}</div>
      </div>
    </main>
  )
}
