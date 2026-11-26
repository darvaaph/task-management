import type { Area, Task } from './types'

export const TEXT_DEBOUNCE_MS = 600

export interface PendingTaskWrite {
  kind: 'task'
  uid: string
  id: string
  patch: Partial<Task>
  timer: number
}

export interface PendingAreaWrite {
  kind: 'area'
  uid: string
  id: string
  patch: Partial<Area>
  timer: number
}

export type PendingWrite = PendingTaskWrite | PendingAreaWrite

/**
 * Manages debounced text writes (title/notes/area name) so rapid typing stays local
 * until the debounce window expires or an explicit flush/cancel occurs.
 */
export class WriteQueue {
  private entries = new Map<string, PendingWrite>()

  get(key: string): PendingWrite | undefined {
    return this.entries.get(key)
  }

  keys(): string[] {
    return Array.from(this.entries.keys())
  }

  take(key: string): PendingWrite | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    window.clearTimeout(entry.timer)
    this.entries.delete(key)
    return entry
  }

  queueTask(key: string, uid: string, id: string, patch: Partial<Task>, onFlush: () => void) {
    const existing = this.entries.get(key)
    if (existing) window.clearTimeout(existing.timer)
    const merged = existing && existing.kind === 'task' ? { ...existing.patch, ...patch } : patch
    const timer = window.setTimeout(onFlush, TEXT_DEBOUNCE_MS)
    this.entries.set(key, { kind: 'task', uid, id, patch: merged, timer })
  }

  queueArea(key: string, uid: string, id: string, patch: Partial<Area>, onFlush: () => void) {
    const existing = this.entries.get(key)
    if (existing) window.clearTimeout(existing.timer)
    const merged = existing && existing.kind === 'area' ? { ...existing.patch, ...patch } : patch
    const timer = window.setTimeout(onFlush, TEXT_DEBOUNCE_MS)
    this.entries.set(key, { kind: 'area', uid, id, patch: merged, timer })
  }
}
