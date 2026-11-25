import { useEffect, useRef, useState } from 'react'
import { rel } from '../lib/dates'
import { areaOf, reminderTimes } from '../lib/logic'
import type { Task } from '../lib/types'
import { useStore } from '../store'

type Perm = NotificationPermission | 'unsupported'

const readPerm = (): Perm => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Browser notification permission, re-read when the user comes back (it can change in site settings). */
export function useNotifyPermission() {
  const [perm, setPerm] = useState<Perm>(readPerm)
  useEffect(() => {
    const h = () => setPerm(readPerm())
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])
  const request = async () => { if (typeof Notification !== 'undefined') setPerm(await Notification.requestPermission()) }
  return { perm, request }
}

/** A reminder that was missed by more than this (app closed, device asleep) is skipped, not shown late. */
const GRACE = 15 * 60e3

/**
 * Rings reminders while TaskFlow is open or running in the background. Without a backend there is no push,
 * so a fully closed app cannot ring; that comes with the server or the Capacitor build.
 */
export function ReminderRunner() {
  const s = useStore()
  const latest = useRef(s)
  latest.current = s

  useEffect(() => {
    const check = () => {
      if (readPerm() !== 'granted') return
      const st = latest.current
      const now = Date.now()
      const seen = new Set(st.account.notified ?? [])
      const ring: [Task, string][] = []
      for (const t of st.tasks) {
        for (const r of reminderTimes(t)) {
          const id = `${t.id}:${t.due}:${r.key}`
          if (r.at <= now && now - r.at < GRACE && !seen.has(id)) ring.push([t, id])
        }
      }
      if (!ring.length) return
      st.markNotified(ring.map(([, id]) => id))
      for (const [t] of ring) show(t, st)
    }
    check()
    const iv = setInterval(check, 30e3)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', check) }
  }, [])

  // Tapping a notification opens its task: the service worker posts the id, or a fresh window gets ?task=.
  const { setUI } = s
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('task')
    if (q) { setUI({ taskId: q }); history.replaceState(null, '', location.pathname) }
    const onMsg = (e: MessageEvent) => { if (e.data?.taskId) setUI({ taskId: e.data.taskId }) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [setUI])

  return null
}

function show(t: Task, s: ReturnType<typeof useStore>) {
  const proj = t.project ? s.projects.find(p => p.id === t.project) : undefined
  const where = proj ? proj.name : t.area ? areaOf(s.areas, t.area).name : 'Inbox'
  const opts: NotificationOptions = {
    body: `${rel(t.due)}${t.time ? ', ' + t.time : ''} · ${where}`,
    tag: t.id,
    icon: '/icon-192.png',
    data: { taskId: t.id },
  }
  // Android Chrome only allows notifications through the service worker; dev builds have none.
  if (navigator.serviceWorker?.controller) {
    void navigator.serviceWorker.ready.then(r => r.showNotification(t.title, opts))
    return
  }
  const n = new Notification(t.title, opts)
  n.onclick = () => { window.focus(); s.setUI({ taskId: t.id }); n.close() }
}

/** Shown under the reminder chips until notifications are allowed on this device. */
export function NotifyHint() {
  const { perm, request } = useNotifyPermission()
  if (perm === 'granted') return null
  const text = {
    default: 'Izinkan notifikasi supaya pengingat muncul di perangkat ini.',
    denied: 'Notifikasi diblokir. Izinkan lewat pengaturan situs di browser.',
    unsupported: 'Browser ini belum mendukung notifikasi. Di iPhone, pasang TaskFlow ke layar utama dulu.',
  }[perm]
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[8px] bg-surface2 px-5 py-4 text-[12.5px] leading-normal text-fg2">
      <span className="min-w-0 flex-1">{text}</span>
      {perm === 'default' && (
        <button type="button" onClick={() => void request()} className="h-15 whitespace-nowrap rounded-[8px] border border-line2 bg-transparent px-5 text-[12.5px] font-medium text-fg">Izinkan</button>
      )}
    </div>
  )
}
