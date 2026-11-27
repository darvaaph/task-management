import { fmt, today } from '../lib/dates'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject, type TextareaHTMLAttributes } from 'react'
import { PRIO, PRIO_KEYS } from '../lib/constants'
import type { Priority } from '../lib/types'

/* Small building blocks shared by every screen. Tailwind spacing unit is 2px (see tailwind-theme.css). */

export function SectionLabel({ children, tone = 'fg' }: { children: ReactNode; tone?: 'fg' | 'fg2' | 'fg3' | 'high' }) {
  const color = { fg: 'text-fg', fg2: 'text-fg2', fg3: 'text-fg3', high: 'text-high' }[tone]
  return <span className={`text-label ${color}`}>{children}</span>
}

export function Dot({ color, round, size = 8 }: { color: string; round?: boolean; size?: number }) {
  return <span aria-hidden="true" className="flex-none" style={{ width: size, height: size, borderRadius: round ? '50%' : 2, background: color }} />
}

export function PrioBadge({ prio, small }: { prio: Priority; small?: boolean }) {
  const p = PRIO[prio]
  return (
    <span className={`flex-none text-badge ${small ? 'rounded-xs px-3 py-1.5 text-[10px]' : 'rounded-[6px] px-3.5 py-1.5'}`} style={{ background: p.bg, color: p.c }}>
      {p.label}
    </span>
  )
}

export function ProgressBar({ pct, color = 'var(--accent)', h = 6 }: { pct: number; color?: string; h?: number }) {
  return (
    <div className="flex-1 overflow-hidden rounded-[9px] bg-surface2" style={{ height: h }}>
      <div className="h-full rounded-[9px] transition-[width] duration-(--dur-bar) ease-(--ease-standard)" style={{ width: pct + '%', background: color }} />
    </div>
  )
}

export function Avatar({ i, c, size = 22, ring }: { i: string; c: string; size?: number; ring?: string }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: c, fontSize: Math.max(10, Math.round(size * 0.45)), border: ring ? `2px solid ${ring}` : undefined }}
    >
      {i}
    </span>
  )
}

/** Segmented control: List | Board, Aktif | Arsip, Terang | Gelap. */
export function Segmented<T extends string>({ value, options, onChange, full, size = 'md' }: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  full?: boolean
  size?: 'md' | 'lg'
}) {
  return (
    <div role="group" className={`flex gap-1 rounded-[9px] bg-surface2 p-1.5 ${full ? 'w-full' : ''}`}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`rounded-sm border-0 font-medium transition-colors ${full ? 'flex-1' : ''} ${size === 'lg' ? 'h-18 text-[14px]' : 'h-14 px-7 text-[13px] max-md:h-18'} ${on ? 'bg-surface text-fg shadow-seg' : 'bg-transparent text-fg2'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Pill chip: area filters and quick dates. Active = inverted. */
export function Chip({ active, onClick, dot, children, size = 'md' }: { active: boolean; onClick: () => void; dot?: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const h = { sm: 'h-14 px-5.5 text-[12.5px]', md: 'h-16 px-6.5 text-[13px]', lg: 'h-18 px-7 text-[13.5px]' }[size]
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex flex-none items-center gap-3.5 whitespace-nowrap rounded-pill border font-medium ${h} ${active ? 'border-fg bg-fg text-bg' : 'border-line2 bg-transparent text-fg2'}`}
    >
      {dot && <span aria-hidden="true" className="size-3.5 rounded-[2px]" style={{ background: dot }} />}
      {children}
    </button>
  )
}

export function PrioPicker({ value, onChange, size = 'sm', stretch }: { value: Priority; onChange: (p: Priority) => void; size?: 'sm' | 'lg'; stretch?: boolean }) {
  return (
    <div className={`flex gap-2 ${stretch ? 'w-full' : ''}`}>
      {PRIO_KEYS.map(k => {
        const on = value === k
        const p = PRIO[k]
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            className={`border ${stretch ? 'flex-1' : ''} ${size === 'lg' ? 'h-20 rounded-md text-[13px] font-medium' : 'text-badge h-14 rounded-[6px] px-4'}`}
            style={{ borderColor: on ? p.c : 'var(--line2)', background: on ? p.bg : 'transparent', color: on ? p.c : size === 'lg' ? 'var(--fg2)' : 'var(--fg3)' }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export function EmptyCard({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-line2 px-9 py-11">
      {title && <span className="font-display text-[17px] font-semibold">{title}</span>}
      <span className="text-[13.5px] leading-normal text-fg2">{children}</span>
      {action}
    </div>
  )
}

export const btnPrimary = 'h-17 rounded-[8px] border-0 bg-fg px-7 text-[13px] font-semibold text-bg whitespace-nowrap'
export const btnSecondary = 'h-17 rounded-[8px] border border-line2 bg-transparent px-6 text-[13px] font-medium text-fg whitespace-nowrap'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** Open dialogs ordered bottom-to-top so only the topmost dialog handles Tab and Escape. */
const dialogStack: HTMLElement[] = []

/** Traps keyboard focus inside a modal/sheet, handles Escape for the topmost dialog, and restores focus on close. */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Capture before commit so child autoFocus doesn't overwrite the triggering element.
  const prevRef = useRef<HTMLElement | null | undefined>(undefined)
  if (prevRef.current === undefined) {
    prevRef.current = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = prevRef.current
    dialogStack.push(el)
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== el) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.getClientRects().length > 0)
      if (!list.length) {
        e.preventDefault()
        el.focus()
        return
      }
      const first = list[0], last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (!active || !el.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      const i = dialogStack.lastIndexOf(el)
      if (i >= 0) dialogStack.splice(i, 1)
      window.removeEventListener('keydown', onKey)
      if (prev?.isConnected && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) {
        prev.focus({ preventScroll: true })
      }
    }
  }, [ref])
}

/** Pull distance (px) past which letting go of the handle closes the sheet. */
const SHEET_CLOSE = 90

/** Bottom sheet (phone): overlay + panel sliding up, focus trapped, Esc closes, drag the handle down to close. */
export function Sheet({ onClose, children, label, maxH = '82%', elevated }: { onClose: () => void; children: ReactNode; label: string; maxH?: string; elevated?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  const [dy, setDy] = useState(0)
  const drag = useRef<{ y: number; t: number } | null>(null)
  const down = (e: PointerEvent<HTMLElement>) => {
    drag.current = { y: e.clientY, t: e.timeStamp }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
  }
  const move = (e: PointerEvent<HTMLElement>) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)) }
  const up = (e: PointerEvent<HTMLElement>) => {
    const g = drag.current
    drag.current = null
    if (!g) return
    const dist = e.clientY - g.y
    // A quick flick closes too, even if it is short.
    if (dist > SHEET_CLOSE || (dist > 30 && dist / Math.max(1, e.timeStamp - g.t) > 0.5)) onClose()
    else setDy(0)
  }
  return (
    <>
      <div className={`animate-fade fixed inset-0 bg-black/40 ${elevated ? 'z-[14]' : 'z-[8]'}`} onClick={onClose} />
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        className={`animate-up fixed inset-x-0 bottom-0 flex flex-col gap-8 overflow-auto [&>*]:flex-none rounded-t-sheet bg-surface px-10 pt-5 pb-[max(34px,calc(env(safe-area-inset-bottom)+12px))] outline-none ${elevated ? 'z-[15]' : 'z-[9]'}`}
        style={{ maxHeight: maxH, transform: dy ? `translateY(${dy}px)` : undefined, transition: drag.current ? 'none' : 'transform var(--dur-base) var(--ease-standard)' }}
      >
        <div
          aria-hidden="true"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDy(0) }}
          className="-mx-10 -mt-5 -mb-4 flex h-17 cursor-grab items-center justify-center"
          style={{ touchAction: 'none' }}
        >
          <span className="h-2.5 w-19 rounded-[9px] bg-line2" />
        </div>
        {children}
      </div>
    </>
  )
}

/** Centered modal (desktop): focus trapped, Esc closes. */
export function Modal({ onClose, children, label, width = 440, elevated }: { onClose: () => void; children: ReactNode; label: string; width?: number; elevated?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)
  return (
    <>
      <div className={`animate-fade fixed inset-0 bg-black/30 ${elevated ? 'z-[30]' : 'z-[20]'}`} onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`animate-fade fixed top-[60px] left-1/2 flex max-h-[calc(100dvh-120px)] -translate-x-1/2 flex-col gap-8 overflow-auto rounded-xl [&>*]:flex-none border border-line bg-surface p-11 shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)] outline-none ${elevated ? 'z-[31]' : 'z-[21]'}`} style={{ width }}>
        {children}
      </div>
    </>
  )
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && dialogStack.length === 0) fn() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}

// The raw date field shows the browser's own format ("25-Nov-2026"); a chip that opens the picker keeps the app's wording.
export const openPicker = (el: HTMLInputElement | null) => {
  if (!el) return
  try { el.showPicker() } catch { el.focus(); el.click() }
}

/** "Pilih tanggal…" chip that opens the device date picker. */
export function DateChip({ value, custom, onChange, size, min }: { value: string | null; custom: boolean; onChange: (v: string | null) => void; size: 'sm' | 'md' | 'lg'; min?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className="relative flex">
      <Chip size={size} active={custom} onClick={() => openPicker(ref.current)}>{custom ? fmt(value) : 'Pilih tanggal…'}</Chip>
      <input ref={ref} type="date" min={min} value={value ?? ''} onChange={e => onChange(e.target.value || null)} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
    </span>
  )
}

/** A labelled date button that opens the device picker. Adds the year only when it isn't this year. */
export function DateField({ value, onChange, label, className }: { value: string | null; onChange: (v: string) => void; label: string; className: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const year = value && value.slice(0, 4) !== today().slice(0, 4) ? ` ${value.slice(0, 4)}` : ''
  const shown = value ? fmt(value) + year : 'Pilih tanggal…'
  return (
    <span className="relative flex">
      <button type="button" aria-label={`${label}: ${value ? shown : 'belum dipilih'}`} onClick={() => openPicker(ref.current)} className={`whitespace-nowrap rounded-[8px] border border-line2 bg-bg px-5 text-[13px] font-medium ${value ? 'text-fg' : 'text-fg3'} ${className}`}>{shown}</button>
      <input ref={ref} type="date" value={value ?? ''} onChange={e => e.target.value && onChange(e.target.value)} tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
    </span>
  )
}

/** Textarea that grows with its text; `rows` is the minimum height. */
export function AutoTextarea({ rows = 1, style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [props.value])
  return <textarea ref={ref} rows={rows} {...props} style={{ ...style, overflow: 'hidden' }} />
}
