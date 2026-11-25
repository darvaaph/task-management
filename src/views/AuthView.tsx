import { useState } from 'react'
import { Chip } from '../components/ui'
import { AREA_COLORS, AREA_PRESETS, DEFAULT_AREA_IDS } from '../lib/constants'
import { useStore } from '../store'

type Mode = 'login' | 'register' | 'areas' | 'forgot' | 'sent'

const okEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/**
 * One sign-in screen: Masuk, Daftar (then Pilih area), Lupa kata sandi, Tautan terkirim.
 * There is no backend yet, so Masuk and Daftar only check the form and sign in on this device.
 */
export function AuthView({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<string[]>(DEFAULT_AREA_IDS)
  const go = (m: Mode) => { setMode(m); setErr(''); setPass('') }

  const submit = () => {
    if (mode === 'login') {
      if (!okEmail(email)) return setErr('Masukkan alamat email yang valid.')
      if (!pass) return setErr('Masukkan kata sandi.')
      s.signIn()
    } else if (mode === 'register') {
      if (!name.trim()) return setErr('Isi nama Anda.')
      if (!okEmail(email)) return setErr('Masukkan alamat email yang valid.')
      if (pass.length < 8) return setErr('Kata sandi minimal 8 karakter.')
      // Keep the typed password so ‹ Kembali returns to a filled form.
      setMode('areas'); setErr('')
    } else if (mode === 'areas') {
      if (!picked.length) return setErr('Pilih minimal satu area.')
      s.register(name.trim(), picked)
    } else if (mode === 'forgot') {
      if (!okEmail(email)) return setErr('Masukkan alamat email yang valid.')
      go('sent')
    }
  }

  const h = mobile ? 'h-25 rounded-[12px] text-[15px]' : 'h-23 rounded-md text-[14px]'
  const input = `${h} border border-line2 bg-surface px-7 text-fg outline-none`
  const primary = `${h} border-0 bg-fg font-semibold text-bg`
  const link = 'border-0 bg-transparent p-2 text-[13px] font-medium text-accent'
  const fieldLabel = 'flex flex-col gap-3 text-[13px] text-fg2'
  const onKey = (e: React.KeyboardEvent) => e.key === 'Enter' && submit()
  const errBox = err && <div role="alert" className="rounded-[8px] bg-high-soft px-6 py-4.5 text-[13px] text-high">{err}</div>
  const head = (title: string, sub: string) => (
    <>
      <h1 className={`m-0 font-display font-semibold tracking-[-0.01em] ${mobile ? 'text-[24px]' : 'text-[28px]'}`}>{title}</h1>
      <p className="m-0 -mt-2 mb-2 text-[14px] leading-normal text-fg2">{sub}</p>
    </>
  )
  const emailField = (
    <label className={fieldLabel}>Email
      <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} placeholder="nama@email.com" className={input} />
    </label>
  )

  const form = (
    <div className="flex flex-col gap-7">
      {mode === 'login' && (
        <>
          {head('Masuk ke TaskFlow', 'Lanjutkan ke tugas dan proyekmu.')}
          {errBox}
          {emailField}
          <label className={fieldLabel}>Kata sandi
            <input type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={onKey} className={input} />
          </label>
          <div className="-mt-3 flex justify-end"><button type="button" onClick={() => go('forgot')} className={link}>Lupa kata sandi?</button></div>
          <button type="button" onClick={submit} className={primary}>Masuk</button>
          <div className="text-center text-[13px] text-fg2">Belum punya akun? <button type="button" onClick={() => go('register')} className={link}>Daftar gratis</button></div>
          <div className="my-2 flex items-center gap-6 text-[12px] text-fg3"><span className="h-px flex-1 bg-line2" />atau<span className="h-px flex-1 bg-line2" /></div>
          <button type="button" onClick={s.startDemo} className={`${mobile ? 'h-27 rounded-[12px]' : 'h-25 rounded-md'} border-0 bg-accent text-[15px] font-semibold text-on-accent`}>Coba Mode Demo</button>
          <div className="text-center text-[12.5px] leading-normal text-fg3">Tanpa daftar. Data contoh tersimpan di perangkat ini.</div>
        </>
      )}
      {mode === 'register' && (
        <>
          {head('Buat akun gratis', 'Simpan tugas di cloud dan pakai di HP maupun laptop.')}
          {errBox}
          <label className={fieldLabel}>Nama
            <input autoComplete="name" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} placeholder="Nama panggilan" className={input} />
          </label>
          {emailField}
          <label className={fieldLabel}>Kata sandi
            <input type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={onKey} aria-describedby="pass-hint" className={input} />
          </label>
          <div id="pass-hint" className={`-mt-3 text-[12.5px] ${pass.length >= 8 ? 'text-fg' : 'text-fg3'}`}>
            {pass.length === 0 ? 'Minimal 8 karakter.' : pass.length < 8 ? `Kurang ${8 - pass.length} karakter lagi.` : '✓ Panjang kata sandi sudah cukup.'}
          </div>
          <button type="button" onClick={submit} className={primary}>Daftar</button>
          <div className="text-center text-[12px] leading-normal text-fg3">Dengan mendaftar, Anda menyetujui Ketentuan Layanan dan Kebijakan Privasi TaskFlow.</div>
          <div className="text-center text-[13px] text-fg2">Sudah punya akun? <button type="button" onClick={() => go('login')} className={link}>Masuk</button></div>
        </>
      )}
      {mode === 'areas' && (
        <>
          {head('Pilih area yang kamu jalani', 'Area memisahkan bidang hidup, misalnya kuliah dan kerja. Bisa diubah kapan saja di Kelola area.')}
          {errBox}
          <div role="group" aria-label="Area awal" className="flex flex-wrap gap-4">
            {AREA_PRESETS.map((a, i) => (
              <Chip key={a.id} size="lg" dot={AREA_COLORS[i]} active={picked.includes(a.id)} onClick={() => { setErr(''); setPicked(p => (p.includes(a.id) ? p.filter(x => x !== a.id) : [...p, a.id])) }}>
                {a.name}
              </Chip>
            ))}
          </div>
          <button type="button" onClick={submit} className={primary}>Lanjut</button>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setMode('register'); setErr('') }} className={link}>‹ Kembali</button>
            <button type="button" onClick={() => s.register(name.trim())} className={link}>Lewati</button>
          </div>
        </>
      )}
      {mode === 'forgot' && (
        <>
          {head('Lupa kata sandi', 'Masukkan email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.')}
          {errBox}
          {emailField}
          <button type="button" onClick={submit} className={primary}>Kirim tautan reset</button>
          <div className="text-center"><button type="button" onClick={() => go('login')} className={link}>‹ Kembali ke Masuk</button></div>
        </>
      )}
      {mode === 'sent' && (
        <>
          {head('Cek email Anda', 'Kalau email ini terdaftar, tautan reset sudah dikirim.')}
          <div className="rounded-md bg-surface2 p-7 text-[13.5px] leading-[1.55] text-fg">
            Tautan dikirim ke <b>{email}</b> dan berlaku 30 menit. Tidak masuk? Periksa folder Spam, atau kirim ulang setelah 1 menit.
          </div>
          <button type="button" onClick={() => go('login')} className={primary}>Kembali ke Masuk</button>
          <div className="text-center"><button type="button" onClick={() => s.say('Tautan reset dikirim ulang')} className={link}>Kirim ulang</button></div>
        </>
      )}
    </div>
  )

  const Logo = ({ size }: { size: number }) => (
    <div className="flex items-center gap-5">
      <span aria-hidden="true" className="rounded-sm bg-accent" style={{ width: size, height: size }} />
      <span className="font-display font-semibold" style={{ fontSize: size - 4 }}>TaskFlow</span>
    </div>
  )

  if (mobile) {
    return (
      <main className="flex min-h-full flex-col gap-7 overflow-auto bg-bg px-13 pt-12 pb-20">
        <Logo size={22} />
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
        <Logo size={24} />
        <div className="flex max-w-[460px] flex-col gap-9">
          <div className="font-display text-[46px] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">Catat cepat. Fokus pada yang penting hari ini.</div>
          <div className="text-[16px] leading-[1.55] opacity-75">Hari Ini, Inbox, Jadwal, dan Proyek dalam satu aplikasi ringan untuk kuliah, kerja, dan rumah.</div>
        </div>
        <div className="flex gap-4">
          {s.areas.slice(0, 3).map(a => (
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
