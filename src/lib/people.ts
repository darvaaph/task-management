import { PEOPLE } from './constants'
import type { Person } from './types'

/** Reuse only the existing avatar colours from PEOPLE (never add new palette colours). */
export const PEOPLE_COLORS = Object.values(PEOPLE).map(p => p.c)

export const initialOf = (name: string) => (name.trim()[0] || '?').toUpperCase()

/** Pick a deterministic colour from PEOPLE_COLORS based on a Firebase UID. */
export function personColorForUid(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0
  }
  return PEOPLE_COLORS[Math.abs(hash) % PEOPLE_COLORS.length]
}

export function resolvePerson(
  id: string,
  opts: {
    selfId: string
    selfName: string
    demo: boolean
    members?: Record<string, Person>
  },
): Person {
  if (id === opts.selfId || id === 'me') {
    const name = opts.selfName.trim() || 'Anda'
    return { name, i: (name[0] || 'A').toUpperCase(), c: PEOPLE.me.c }
  }
  if (opts.demo && PEOPLE[id]) return PEOPLE[id]
  if (opts.members?.[id]) return opts.members[id]
  if (PEOPLE[id]) return PEOPLE[id]
  return { name: 'Anggota', i: '?', c: personColorForUid(id) }
}
