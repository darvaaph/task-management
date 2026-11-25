import { useEffect, type ReactNode } from 'react'
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
      <div className="h-full rounded-[9px] transition-[width] duration-300" style={{ width: pct + '%', background: color }} />
    </div>
  )
}

export function Avatar({ i, c, size = 22, ring }: { i: string; c: string; size?: number; ring?: string }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: c, fontSize: Math.round(size * 0.45), border: ring ? `2px solid ${ring}` : undefined }}
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
            className={`rounded-sm border-0 font-medium transition-colors ${full ? 'flex-1' : ''} ${size === 'lg' ? 'h-17 text-[14px]' : 'px-7 py-3.5 text-[13px]'} ${on ? 'bg-surface text-fg shadow-seg' : 'bg-transparent text-fg2'}`}
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
            className={`border text-badge ${stretch ? 'flex-1' : ''} ${size === 'lg' ? 'h-20 rounded-md text-[12px]' : 'h-14 rounded-[6px] px-4'}`}
            style={{ borderColor: on ? p.c : 'var(--line2)', background: on ? p.bg : 'transparent', color: on ? p.c : 'var(--fg3)' }}
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

/** Bottom sheet (phone): overlay + panel sliding up, Esc closes. */
export function Sheet({ onClose, children, label, maxH = '82%' }: { onClose: () => void; children: ReactNode; label: string; maxH?: string }) {
  useEscape(onClose)
  return (
    <>
      <div className="animate-fade fixed inset-0 z-[8] bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className="animate-up fixed inset-x-0 bottom-0 z-[9] flex flex-col gap-8 overflow-auto [&>*]:flex-none rounded-t-sheet bg-surface px-10 pt-5 pb-17" style={{ maxHeight: maxH }}>
        <span aria-hidden="true" className="h-2.5 w-19 flex-none self-center rounded-[9px] bg-line2" />
        {children}
      </div>
    </>
  )
}

/** Centered modal (desktop). */
export function Modal({ onClose, children, label, width = 440 }: { onClose: () => void; children: ReactNode; label: string; width?: number }) {
  useEscape(onClose)
  return (
    <>
      <div className="animate-fade fixed inset-0 z-[20] bg-black/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className="animate-fade fixed top-[60px] left-1/2 z-[21] flex max-h-[calc(100vh-120px)] -translate-x-1/2 flex-col gap-8 overflow-auto rounded-xl [&>*]:flex-none border border-line bg-surface p-11 shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)]" style={{ width }}>
        {children}
      </div>
    </>
  )
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}
