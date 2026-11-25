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
