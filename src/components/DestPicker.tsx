import { destInfo, type Dest } from '../lib/logic'
import { useStore } from '../store'

/** "Ke [tujuan ▾]" button. The option list opens in place, not as a floating popover. */
export function DestButton({ value, open, onToggle, tall }: { value: Dest; open: boolean; onToggle: () => void; tall?: boolean }) {
  const s = useStore()
  const info = destInfo(value, s.projects, s.areas)
  return (
    <button
      type="button"
      aria-label={`Pilih tujuan, sekarang ${info.label}`}
      aria-expanded={open}
      onClick={onToggle}
      className={`flex max-w-full items-center gap-3.5 whitespace-nowrap rounded-pill border border-line2 px-6 text-[13px] font-medium text-fg ${tall ? 'h-18' : 'h-14'} ${open ? 'bg-surface2' : 'bg-transparent'}`}
    >
      <span aria-hidden="true" className="size-4 flex-none rounded-[2px]" style={{ background: info.color }} />
      <span className="truncate">{info.label}</span>
      <span aria-hidden="true" className="text-[11px] text-fg3">▾</span>
    </button>
  )
}

export function DestList({ value, onPick, tall }: { value: Dest; onPick: (v: Dest) => void; tall?: boolean }) {
  const s = useStore()
  const opt = (v: Dest, label: string, color: string, opts: { indent?: boolean; round?: boolean; bold?: boolean } = {}) => {
    const on = v === value
    return (
      <button
        key={v}
        type="button"
        onClick={() => onPick(v)}
        className={`flex items-center gap-4 rounded-[8px] border-0 pr-5 text-left text-[13.5px] text-fg ${tall ? 'min-h-21' : 'min-h-17'} ${opts.indent ? 'pl-15' : 'pl-5'} ${on ? 'bg-accent-soft' : 'bg-transparent hover:bg-hover'}`}
        style={{ fontWeight: opts.bold ? 600 : 400 }}
      >
        <span aria-hidden="true" className="size-4 flex-none" style={{ background: color, borderRadius: opts.round ? '50%' : 2 }} />
        <span className="flex-1">{label}</span>
        {on && <span className="font-bold text-accent">✓</span>}
      </button>
    )
  }
  const head = (label: string) => <span key={label} className="text-label px-5 pt-4 pb-2 text-fg3">{label}</span>
  return (
    <div className="flex max-h-[250px] flex-col gap-0.5 overflow-auto rounded-[12px] border border-line bg-surface p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,.25)]">
      {head('INBOX')}
      {opt('inbox', 'Inbox (tanpa area)', 'var(--fg3)')}
      {s.areas.map(a => opt('area:' + a.id, 'Inbox · ' + a.name, a.color))}
      {head('PROYEK')}
      {s.projects.filter(p => !p.archived).flatMap(p => [
        opt('proj:' + p.id, p.name, p.color, { round: true, bold: true }),
        ...p.sections.map(sc => opt(`proj:${p.id}:${sc}`, sc, p.color, { indent: true, round: true })),
      ])}
    </div>
  )
}
