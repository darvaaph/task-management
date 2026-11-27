import { LogoMark } from '../components/icons'

interface PrivacyViewProps {
  mobile: boolean
  loggedIn: boolean
  onBack: () => void
}

const SECTIONS = [
  {
    title: 'Data yang kami simpan',
    body: 'Saat kamu masuk dengan Google, kami menyimpan nama, alamat email, dan foto profil akun Google kamu. Kami juga menyimpan area, tugas, catatan, pengingat, proyek, dan riwayat aktivitas proyek yang kamu buat di TaskFlow. Mode Demo hanya tersimpan di browser perangkatmu dan tidak dikirim ke server.',
  },
  {
    title: 'Di mana data disimpan',
    body: 'Seluruh data akun disimpan di layanan Google Firebase (Authentication dan Cloud Firestore) pada wilayah server Jakarta (asia-southeast2). Salinan sementara juga disimpan di penyimpanan browser perangkatmu supaya kamu tetap bisa membaca dan mengubah tugas saat offline.',
  },
  {
    title: 'Siapa yang melihat datamu',
    body: 'Area dan tugas lepas bersifat pribadi dan hanya bisa kamu akses. Di dalam proyek bersama, nama, foto profil, dan tugas pada proyek tersebut dapat dilihat oleh anggota lain yang bergabung lewat tautan undangan. Kami tidak menjual datamu dan tidak memasang pelacak iklan.',
  },
  {
    title: 'Cara menghapus data dan akunmu',
    body: 'Kamu bisa menghapus tugas, area, atau proyek kapan saja di dalam aplikasi. Untuk menghapus seluruh akun beserta semua data pribadi dan proyek milikmu secara permanen, buka Profil lalu pilih Hapus akun (atau bagian akun di bawah sidebar desktop). Penghapusan akun juga mengeluarkanmu dari proyek bersama milik orang lain dan tidak bisa dibatalkan.',
  },
  {
    title: 'Kontak',
    body: 'Jika kamu memiliki pertanyaan atau permintaan terkait privasi datamu, hubungi kami di: [KONTAK — diisi pemilik]',
  },
] as const

/** Static Indonesian privacy policy page served at /privasi (HANDOFF-FASE3 §4 3B #4). */
export function PrivacyView({ mobile, loggedIn, onBack }: PrivacyViewProps) {
  return (
    <main className={`min-h-full overflow-auto bg-bg ${mobile ? 'px-8 pt-10 pb-20' : 'px-16 py-20'}`}>
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LogoMark size={22} />
            <span className="font-display text-[17px] font-semibold">TaskFlow</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className={`${mobile ? 'h-18 px-6' : 'h-17 px-7'} rounded-md border border-line2 bg-surface text-[13px] font-medium text-fg hover:bg-hover`}
          >
            {loggedIn ? '‹ Kembali ke aplikasi' : '‹ Kembali ke Masuk'}
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <span className="text-label text-fg3">PRIVASI</span>
          <h1 className={`m-0 font-display font-semibold tracking-[-0.015em] ${mobile ? 'text-[26px]' : 'text-[32px]'}`}>
            Kebijakan Privasi
          </h1>
          <p className="m-0 text-[13.5px] leading-normal text-fg2">
            Ringkasan tentang data apa yang disimpan TaskFlow, di mana data disimpan, siapa yang bisa melihatnya, dan cara menghapusnya.
          </p>
          <span className="font-mono text-[11px] text-fg3">TERAKHIR DIPERBARUI · 27 NOV 2026</span>
        </div>

        <div className="flex flex-col gap-5">
          {SECTIONS.map((sec) => (
            <section key={sec.title} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-8">
              <h2 className="m-0 font-display text-[16px] font-semibold text-fg">{sec.title}</h2>
              <p className="m-0 text-[14px] leading-[1.6] text-fg2">{sec.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
