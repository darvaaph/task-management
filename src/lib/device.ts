import { useEffect, useState } from 'react'

/** Live result of a CSS media query. */
export function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const h = () => setM(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

/** Primary input is a finger, whatever the screen width (iPad, Android tablet, phone). */
export const useTouch = () => useMedia('(pointer: coarse)')

// iPadOS reports itself as "MacIntel" with touch points, so it counts as Apple too.
const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** Shortcut label for the platform: ⌘K on Apple devices, Ctrl+K elsewhere. */
export const searchShortcut = apple ? '⌘K' : 'Ctrl+K'
