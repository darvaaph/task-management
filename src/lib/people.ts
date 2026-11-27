import { PEOPLE } from './constants'
import type { Person, Project, ProjectMember } from './types'

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
    membersByProject: Record<string, Record<string, ProjectMember>>
    projectId?: string
  },
): Person {
  if (id === opts.selfId || id === 'me') {
    const name = opts.selfName.trim() || 'Kamu'
    return { name, i: (name[0] || 'K').toUpperCase(), c: PEOPLE.me.c }
  }
  if (opts.demo && PEOPLE[id]) return PEOPLE[id]

  const fromProject = opts.projectId ? opts.membersByProject[opts.projectId]?.[id] : undefined
  if (fromProject) {
    return { name: fromProject.name, i: initialOf(fromProject.name), c: personColorForUid(id) }
  }

  for (const map of Object.values(opts.membersByProject)) {
    const found = map[id]
    if (found) return { name: found.name, i: initialOf(found.name), c: personColorForUid(id) }
  }

  if (PEOPLE[id]) return PEOPLE[id]
  return { name: 'Anggota', i: '?', c: personColorForUid(id) }
}

/**
 * Inside a shared project, Pro features (duration, weekdays/monthly repeat, multiple reminders,
 * project Timeline, activity history) follow the project owner's plan, not the current user's plan.
 */
export function isProForProject(
  project: Pick<Project, 'ownerPlan'> | null | undefined,
  accountIsPro: boolean,
  demo: boolean,
): boolean {
  if (demo) return true
  if (project?.ownerPlan) return project.ownerPlan === 'pro'
  return accountIsPro
}
