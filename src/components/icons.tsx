import type { SVGProps } from 'react'

const base = (size: number, sw: number): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
})

type P = { size?: number; sw?: number }

export const IconToday = ({ size = 16, sw = 2 }: P) => (
  <svg {...base(size, sw)}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></svg>
)
export const IconInbox = ({ size = 16, sw = 2 }: P) => (
  <svg {...base(size, sw)}><path d="M3 13h5l1.5 3h5l1.5-3h5" /><path d="M5.6 5.6A1.6 1.6 0 0 1 7.1 4.5h9.8a1.6 1.6 0 0 1 1.5 1.1L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></svg>
)
export const IconCalendar = ({ size = 16, sw = 2 }: P) => (
  <svg {...base(size, sw)}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
)
export const IconFolder = ({ size = 16, sw = 2 }: P) => (
  <svg {...base(size, sw)}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /></svg>
)

export const IconGoogle = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flex-none">
    <path d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.38-1.5 4.05-5.27 4.05-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 3.85 14.69 3 12.17 3 7.11 3 3 7.11 3 12.25s4.11 9.25 9.17 9.25c5.29 0 8.8-3.72 8.8-8.95 0-.6-.06-1.06-.15-1.45z" />
  </svg>
)

/** TaskFlow mark: an open progress ring with the tick breaking out of its gap. Follows the accent colour. */
export const LogoMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="flex-none">
    <rect width="64" height="64" rx="15" fill="var(--accent)" />
    <g fill="none" stroke="var(--on-accent)" strokeLinecap="round" strokeLinejoin="round">
      <path strokeWidth="5.5" d="M47.97 26.19A17 17 0 1 1 37.81 16.03" />
      <path strokeWidth="6" d="M22.5 31.5 29.5 38.5 50.5 12.5" />
    </g>
  </svg>
)
