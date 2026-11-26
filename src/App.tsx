import { useEffect, useState } from 'react'
import { QuickSheet } from './components/Composer'
import { InviteView, PickMemberAreaDialog } from './components/Invite'
import { ManageAreas, ManageProject } from './components/Manage'
import { ShareProject } from './components/Share'
import { Search, SearchButton } from './components/Search'
import { ReminderRunner, useNotifyPermission } from './components/Reminders'
import { AccentPicker, ProBadge, ProScreen } from './components/Pro'
import { AuthView } from './views/AuthView'
import { IconCalendar, IconFolder, IconInbox, IconToday, LogoMark } from './components/icons'
import { DetailPanel, DetailSheet } from './components/TaskDetail'
import { Modal, Segmented, Sheet } from './components/ui'
import { FREE_PROJECT_QUOTA } from './lib/constants'
import { searchShortcut, useMedia, useTouch } from './lib/device'
import { canVibrate } from './lib/feedback'
import { projectProgress } from './lib/logic'
import { useStore, type Store, type View } from './store'
import { InboxView } from './views/InboxView'
import { ProjectView } from './views/ProjectView'
import { ProjectsView } from './views/ProjectsView'
import { TodayView } from './views/TodayView'
import { JadwalView } from './views/JadwalView'

const NAV: { view: View; label: string; Icon: typeof IconToday }[] = [
  { view: 'today', label: 'Hari Ini', Icon: IconToday },
  { view: 'inbox', label: 'Inbox', Icon: IconInbox },
  { view: 'jadwal', label: 'Jadwal', Icon: IconCalendar },
  { view: 'projects', label: 'Proyek', Icon: IconFolder },
]
const planLabel = (a: Store['account']) => (a.demo ? 'Mode Demo' : a.plan === 'pro' ? 'Pro · selamanya' : 'Gratis')
const initial = (name: string) => (name.trim()[0] || 'A').toUpperCase()

const ONOFF = [{ value: 'off' as const, label: 'Mati' }, { value: 'on' as const, label: 'Nyala' }]
const onoff = (v?: boolean) => (v ? 'on' : 'off')

const isActive = (cur: View, v: View) => cur === v || (v === 'projects' && cur === 'project')

export default function App() {
  const s = useStore()
  const mobile = useMedia('(max-width: 767px)')
  // Below laptop width (iPad, small windows) the detail panel floats over the page instead of taking a column.
  const wide = useMedia('(min-width: 1100px)')
  const [quick, setQuick] = useState(false)
  const [profile, setProfile] = useState(false)
  const sel = s.ui.taskId ? s.tasks.find(t => t.id === s.ui.taskId) : undefined
  const { setUI } = s
  // ⌘K / Ctrl+K opens search from anywhere.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setUI({ overlay: 'search' }) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setUI])
  const proj = s.ui.view === 'project' ? s.projects.find(p => p.id === s.ui.projectId) : undefined
  const overlays = (
    <>
      {s.ui.overlay === 'search' && <Search mobile={mobile} />}
      {s.ui.overlay === 'project' && proj && <ManageProject project={proj} mobile={mobile} />}
      {s.ui.overlay === 'share' && proj && <ShareProject project={proj} mobile={mobile} />}
      {s.ui.overlay === 'areas' && <ManageAreas mobile={mobile} />}
      {s.ui.pro && <ProScreen mobile={mobile} />}
      {s.joinedProjectId && <PickMemberAreaDialog mobile={mobile} />}
      {s.pendingMigration && <LocalMigrationDialog mobile={mobile} />}
    </>
  )
  if (!s.account.loggedIn) return <><AuthView mobile={mobile} /><Toast mobile={mobile} /></>
  if (s.inviteToken) return <><InviteView mobile={mobile} /><Toast mobile={mobile} /></>

  // Composer state resets whenever the page changes.
  const pageKey = s.ui.view + ':' + (s.ui.projectId ?? '')

  const page = (() => {
    switch (s.ui.view) {
      case 'today': return <TodayView mobile={mobile} onSearchProfile={mobile && <><SearchButton onClick={() => s.setUI({ overlay: 'search' })} /><ProfileButton onClick={() => setProfile(true)} /></>} />
      case 'inbox': return <InboxView mobile={mobile} />
      case 'projects': return <ProjectsView mobile={mobile} />
      case 'project': return <ProjectView mobile={mobile} />
      case 'jadwal': return <JadwalView mobile={mobile} />
    }
  })()

  if (mobile) {
    return (
      <div className="flex h-full flex-col bg-bg">
        {s.account.demo && s.ui.banner && <DemoBanner mobile />}
        <main key={pageKey} className="min-h-0 flex-1 overflow-auto pb-[calc(86px+var(--nav-pad))]">{page}</main>
        <button type="button" aria-label="Tambah tugas" onClick={() => setQuick(true)} className="fixed right-10 bottom-[calc(80px+var(--nav-pad))] z-[4] size-29 rounded-fab border-0 bg-accent text-[30px] leading-none text-on-accent shadow-fab">+</button>
        <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-[4] grid h-[calc(64px+var(--nav-pad))] grid-cols-4 content-start border-t border-line bg-surface px-4 pt-3">
          {NAV.map(({ view, label, Icon }) => {
            const on = isActive(s.ui.view, view)
            return (
              <button key={view} type="button" aria-current={on ? 'page' : undefined} onClick={() => s.go(view)} className={`flex h-27 flex-col items-center justify-center gap-1.5 border-0 bg-transparent p-0 text-[11.5px] ${on ? 'font-semibold text-accent' : 'font-medium text-fg2'}`}>
                <span className={`grid h-15 w-28 place-items-center rounded-pill transition-colors ${on ? 'bg-accent-soft' : ''}`}><Icon size={22} sw={1.9} /></span>
                {label}
              </button>
            )
          })}
        </nav>
        {sel && <DetailSheet key={sel.id} task={sel} />}
        {quick && <QuickSheet onClose={() => setQuick(false)} />}
        {profile && <ProfileSheet onClose={() => setProfile(false)} />}
        {overlays}
        <Toast mobile />
        <ReminderRunner />
      </div>
    )
  }

  return (
    <div className="flex h-full bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {s.account.demo && s.ui.banner && <DemoBanner />}
        <main key={pageKey} className={`min-h-0 flex-1 overflow-auto ${s.ui.view === 'jadwal' ? 'px-14 pt-12 pb-10' : 'px-22 pt-16 pb-24'}`}>{page}</main>
      </div>
      {sel && <DetailPanel key={sel.id} task={sel} floating={!wide} />}
      {overlays}
      <Toast />
      <ReminderRunner />
    </div>
  )
}

function Sidebar() {
  const s = useStore()
  const active = s.projects.filter(p => !p.archived)
  const ownedCount = active.filter(s.isOwner).length
  const todayOpen = s.todayTasks.filter(t => t.status !== 'done').length + s.overdueTasks.length
  const inboxOpen = s.tasks.filter(t => !t.project && t.status !== 'done').length
  const counts: Partial<Record<View, number>> = { today: todayOpen, inbox: inboxOpen }
  const item = 'flex items-center gap-5 rounded-[8px] border-0 px-5 text-left'
  return (
    <aside className="flex w-[236px] flex-none flex-col gap-6 overflow-auto border-r border-line bg-surface px-6 py-7">
      <div className="flex items-center gap-4.5 px-4 py-1">
        <LogoMark size={22} />
        <span className="font-display text-[17px] font-semibold">TaskFlow</span>
      </div>
      <button type="button" onClick={() => s.setUI({ overlay: 'search' })} className="flex h-17 items-center justify-between rounded-[8px] border-0 bg-surface2 px-5 text-left text-[13px] text-fg3">
        <span>Cari cepat…</span><span className="font-mono text-[11px]">{searchShortcut}</span>
      </button>
      <nav aria-label="Menu utama" className="flex flex-col gap-1">
        {NAV.map(({ view, label, Icon }) => {
          const on = isActive(s.ui.view, view)
          return (
            <button key={view} type="button" aria-current={on ? 'page' : undefined} onClick={() => s.go(view)} className={`${item} h-17 text-[14px] ${on ? 'bg-surface2 font-semibold text-fg' : 'bg-transparent font-medium text-fg2 hover:bg-hover'}`}>
              <span className={`grid ${on ? 'text-accent' : 'text-fg3'}`}><Icon /></span>
              <span className="flex-1">{label}</span>
              {counts[view] != null && <span className="font-mono text-[11px] text-fg3">{counts[view]}</span>}
            </button>
          )
        })}
      </nav>
      <div className="flex flex-col gap-1">
        <div className="flex items-center pr-2 pb-2 pl-5">
          <span className="text-label flex-1 text-fg3">AREA</span>
          <button type="button" onClick={() => s.setUI({ overlay: 'areas' })} className="rounded-[6px] border-0 bg-transparent px-3 py-2 text-[12px] font-medium text-fg2 hover:bg-hover">Kelola</button>
        </div>
        {s.areas.map(a => {
          const n = s.tasks.filter(t => t.status !== 'done' && (t.area === a.id || s.projects.find(p => p.id === t.project)?.area === a.id)).length
          return (
            <button key={a.id} type="button" onClick={() => s.go('projects', { projArea: a.id, archives: false })} className={`${item} h-16 bg-transparent text-[13.5px] font-medium text-fg2 hover:bg-hover`}>
              <span aria-hidden="true" className="size-4 rounded-[2px]" style={{ background: a.color }} />
              <span className="flex-1">{a.name}</span>
              <span className="font-mono text-[11px] text-fg3">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-label px-5 pb-3 text-fg3">PROYEK ({s.isPro ? active.length : `${ownedCount}/${FREE_PROJECT_QUOTA}`})</span>
        {active.map(p => {
          const on = s.ui.view === 'project' && s.ui.projectId === p.id
          return (
            <button key={p.id} type="button" onClick={() => s.go('project', { projectId: p.id })} className={`${item} h-16 text-[13.5px] font-medium text-fg2 ${on ? 'bg-surface2' : 'bg-transparent hover:bg-hover'}`}>
              <span aria-hidden="true" className="size-4 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="font-mono text-[11px] text-fg3">{projectProgress(p, s.tasks).pct}%</span>
            </button>
          )
        })}
        <button type="button" onClick={() => s.go('projects', { archives: true, projArea: 'all' })} className={`${item} h-16 bg-transparent text-[13.5px] font-medium text-fg3 hover:bg-hover`}>
          <span aria-hidden="true" className="size-4 rounded-[2px] border-[1.5px] border-fg3" />Arsip
        </button>
      </div>
      <div className="flex-1" />
      {!s.isPro && (
        <div className="flex flex-col gap-3 rounded-[12px] bg-surface2 px-6 py-5.5">
          <div className="font-display text-[14px] font-semibold">TaskFlow Pro</div>
          <div className="text-[12.5px] leading-[1.45] text-fg2">Timeline, durasi tugas, dan proyek tanpa batas. Sekali bayar, aktif selamanya.</div>
          <button type="button" onClick={() => s.openPro()} className="h-16 rounded-[8px] border-0 bg-fg text-[12.5px] font-semibold text-bg">Lihat Pro</button>
        </div>
      )}
      {s.account.plan === 'pro' && (
        <button type="button" onClick={() => s.openPro()} className="flex items-center gap-4 rounded-[12px] border-0 bg-accent-soft px-6 py-5 text-left text-[13px] font-medium text-fg">
          <ProBadge /><span className="flex-1">Pro aktif selamanya</span>
        </button>
      )}
      <Segmented value={s.theme} onChange={s.setTheme} options={[{ value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} full />
      <div className="flex items-center justify-between px-3"><span className="text-[12px] text-fg2">Aksen</span><AccentPicker /></div>
      <div className="flex items-center justify-between px-3"><span className="text-[12px] text-fg2">Suara</span><Segmented value={onoff(s.account.sound)} onChange={v => s.setAccount({ sound: v === 'on' })} options={ONOFF} /></div>
      <div className="flex items-center gap-5 px-3">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-accent text-[12px] font-semibold text-on-accent">{initial(s.account.name)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium">{s.account.name}</span>
          <span className="text-[11.5px] text-fg3">{planLabel(s.account)}</span>
        </div>
        {s.account.demo && <button type="button" onClick={s.resetDemo} className="border-0 bg-transparent p-2 text-[12px] font-medium text-fg3">Reset</button>}
        <button type="button" onClick={s.signOut} className="border-0 bg-transparent p-2 text-[12px] font-medium text-fg3">Keluar</button>
      </div>
    </aside>
  )
}

function DemoBanner({ mobile }: { mobile?: boolean }) {
  const s = useStore()
  return (
    <div className="flex flex-none items-center gap-5 bg-accent-soft px-10 py-4.5 text-[12.5px] text-fg2">
      <span className="font-mono text-[10px] font-semibold tracking-[.06em] text-accent">MODE DEMO</span>
      <span className="flex-1">{mobile ? 'Data demo hanya tersimpan di perangkat ini.' : 'Data Demo hanya tersimpan di browser ini — Daftar gratis untuk menyimpan ke cloud & bagikan proyek sungguhan.'}</span>
      <button type="button" onClick={() => s.setUI({ banner: false })} className="border-0 bg-transparent text-[12.5px] text-fg2">Tutup</button>
    </div>
  )
}

function ProfileButton({ onClick }: { onClick: () => void }) {
  const s = useStore()
  return <button type="button" onClick={onClick} aria-label="Profil dan pengaturan" className="mt-2 size-20 rounded-full border-0 bg-accent text-[14px] font-semibold text-on-accent">{initial(s.account.name)}</button>
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const owned = s.projects.filter(p => !p.archived && s.isOwner(p)).length
  const vibrate = useTouch() && canVibrate
  const notify = useNotifyPermission()
  const row = 'flex items-center gap-5 border-b border-line'
  return (
    <Sheet onClose={onClose} label="Profil">
      <div className="flex items-center gap-6">
        <span aria-hidden="true" className="grid size-24 place-items-center rounded-full bg-accent text-[18px] font-semibold text-on-accent">{initial(s.account.name)}</span>
        <div className="flex flex-col gap-1">
          <span className="font-display text-[18px] font-semibold">{s.account.name}</span>
          <span className="text-[13px] text-fg3">{planLabel(s.account)} · {s.isPro ? owned : `${owned}/${FREE_PROJECT_QUOTA}`} proyek aktif</span>
        </div>
      </div>
      <div className="flex flex-col rounded-[12px] bg-bg text-[14px]">
        <div className={`${row} py-4 pr-4 pl-7`}>
          <span className="flex-1 text-fg2">Tema</span>
          <Segmented value={s.theme} onChange={s.setTheme} options={[{ value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]} />
        </div>
        <div className={`${row} py-4 pr-4 pl-7`}>
          <span className="flex-1 text-fg2">Suara saat selesai</span>
          <Segmented value={onoff(s.account.sound)} onChange={v => s.setAccount({ sound: v === 'on' })} options={ONOFF} />
        </div>
        <div className={`${row} py-4 pr-4 pl-7`}>
          <span className="flex-1 text-fg2">Notifikasi pengingat</span>
          {notify.perm === 'default'
            ? <button type="button" onClick={() => void notify.request()} className="h-17 rounded-[8px] border border-line2 bg-transparent px-6 text-[13px] font-medium text-fg">Izinkan</button>
            : <span className="py-4 pr-3 text-[13px] text-fg3">{{ granted: 'Aktif', denied: 'Diblokir', unsupported: 'Tidak didukung' }[notify.perm]}</span>}
        </div>
        {vibrate && (
          <div className={`${row} py-4 pr-4 pl-7`}>
            <span className="flex-1 text-fg2">Getaran</span>
            <Segmented value={onoff(s.account.haptics)} onChange={v => s.setAccount({ haptics: v === 'on' })} options={ONOFF} />
          </div>
        )}
        <button type="button" onClick={() => { onClose(); s.setUI({ overlay: 'areas' }) }} className={`${row} border-x-0 border-t-0 bg-transparent p-7 text-left text-fg`}>
          <span className="flex-1">Kelola area</span><span aria-hidden="true" className="text-fg3">›</span>
        </button>
        <div className={`${row} px-7 py-5`}><span className="flex-1 text-fg2">Warna aksen</span><AccentPicker /></div>
        <button type="button" onClick={() => { onClose(); s.openPro() }} className="flex items-center gap-4 border-0 bg-transparent p-7 text-left text-fg">
          <span className="flex-1">TaskFlow Pro</span>
          <span className="text-[12px] font-semibold text-accent">{s.account.plan === 'pro' ? 'Aktif' : s.account.demo ? 'Demo' : 'Lihat'}</span>
        </button>
      </div>
      {s.account.demo && <button type="button" onClick={() => { s.resetDemo(); onClose() }} className="h-22 rounded-[12px] border border-line2 bg-transparent text-[14px] font-medium text-fg">Reset data demo</button>}
      <button type="button" onClick={() => { onClose(); s.signOut() }} className="h-24 rounded-[12px] border border-line2 bg-transparent text-[15px] font-medium text-high">Keluar</button>
    </Sheet>
  )
}

function LocalMigrationDialog({ mobile }: { mobile: boolean }) {
  const s = useStore()
  const m = s.pendingMigration
  if (!m) return null
  const parts = [
    m.areas.length ? `${m.areas.length} area` : '',
    m.tasks.length ? `${m.tasks.length} tugas lepas` : '',
    m.projects.length ? `${m.projects.length} proyek` : '',
  ].filter(Boolean)
  const onDismiss = s.migrating ? s.abortMigration : s.skipMigration
  const body = (
    <>
      <h2 className="m-0 font-display text-[20px] leading-tight font-semibold">Pindahkan data di perangkat ini ke akun Anda?</h2>
      <p className="m-0 text-[13.5px] leading-normal text-fg2">
        {m.projects.length > 0
          ? `Ditemukan ${parts.join(', ')} di perangkat ini. PIC tugas yang ditugaskan ke Anda ikut dipindahkan, sedangkan nama contoh dikosongkan. Proyek yang melebihi kuota tetap tersimpan di perangkat ini.`
          : `Ditemukan ${parts.join(' dan ')} di browser ini.`}
      </p>
      {s.migrating && s.migrationStatus && (
        <div role="status" className="rounded-[8px] bg-surface2 px-6 py-4.5 text-[13px] text-fg2">{s.migrationStatus}</div>
      )}
      {s.migrationError && <div role="alert" className="rounded-[8px] bg-high-soft px-6 py-4.5 text-[13px] text-high">{s.migrationError}</div>}
      <div className={mobile ? 'flex flex-col gap-3' : 'flex gap-4'}>
        {!mobile && (
          <button type="button" onClick={onDismiss} className="h-20 flex-1 rounded-md border border-line2 bg-transparent text-[14px] font-medium text-fg">
            {s.migrating ? 'Batalkan' : 'Lewati'}
          </button>
        )}
        <button type="button" disabled={s.migrating} onClick={() => void s.migrateLocalData()} className={`${mobile ? 'h-24 rounded-[12px] text-[15px]' : 'h-20 flex-1 rounded-md text-[14px]'} border-0 bg-fg font-semibold text-bg disabled:opacity-60`}>
          {s.migrating ? 'Memindahkan…' : 'Pindahkan'}
        </button>
        {mobile && (
          <button type="button" onClick={onDismiss} className="h-22 rounded-[12px] border border-line2 bg-transparent text-[14px] font-medium text-fg">
            {s.migrating ? 'Batalkan' : 'Lewati'}
          </button>
        )}
      </div>
    </>
  )
  return mobile
    ? <Sheet onClose={onDismiss} label="Pindahkan data lokal">{body}</Sheet>
    : <Modal onClose={onDismiss} label="Pindahkan data lokal" width={440}>{body}</Modal>
}

function Toast({ mobile }: { mobile?: boolean }) {
  const { toast } = useStore()
  if (!toast) return null
  return (
    <div role="status" className={`animate-fade fixed left-1/2 z-[50] flex min-h-20 max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-7 rounded-md bg-fg py-4 pr-4 pl-9 text-[13px] font-medium text-bg shadow-[0_24px_60px_-20px_rgba(0,0,0,.5)] ${mobile ? 'bottom-[calc(152px+var(--nav-pad))]' : 'bottom-14'}`}>
      <span className="py-1.5 pr-5">{toast.msg}</span>
      {toast.undo && <button type="button" onClick={toast.undo} className="h-15 rounded-sm border border-current bg-transparent px-6 text-[13px] font-semibold text-bg">Urungkan</button>}
    </div>
  )
}
