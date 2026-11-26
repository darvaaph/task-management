import type { Area, Project, Task } from './types'

export const TEXT_DEBOUNCE_MS = 600
export const UNDO_SERVER_DELAY_MS = 6000

export interface PendingTaskWrite {
  kind: 'task'
  uid: string
  projectId: string | null
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

export interface PendingProjectWrite {
  kind: 'project'
  uid: string
  id: string
  patch: Partial<Project>
  timer: number
}

export type PendingWrite = PendingTaskWrite | PendingAreaWrite | PendingProjectWrite

export interface DelayedServerAction {
  timer: number
  send: () => void
  undo: () => void
}

/**
 * Manages debounced text writes (title/notes/area name/project name) and 6s delayed
 * server calls so rapid typing stays local and server actions can be undone before firing.
 */
export class WriteQueue {
  private entries = new Map<string, PendingWrite>()
  private delayed: DelayedServerAction | null = null

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

  queueTask(key: string, uid: string, projectId: string | null, id: string, patch: Partial<Task>, onFlush: () => void) {
    const existing = this.entries.get(key)
    if (existing) window.clearTimeout(existing.timer)
    const merged = existing && existing.kind === 'task' ? { ...existing.patch, ...patch } : patch
    const timer = window.setTimeout(onFlush, TEXT_DEBOUNCE_MS)
    this.entries.set(key, { kind: 'task', uid, projectId, id, patch: merged, timer })
  }

  queueArea(key: string, uid: string, id: string, patch: Partial<Area>, onFlush: () => void) {
    const existing = this.entries.get(key)
    if (existing) window.clearTimeout(existing.timer)
    const merged = existing && existing.kind === 'area' ? { ...existing.patch, ...patch } : patch
    const timer = window.setTimeout(onFlush, TEXT_DEBOUNCE_MS)
    this.entries.set(key, { kind: 'area', uid, id, patch: merged, timer })
  }

  queueProject(key: string, uid: string, id: string, patch: Partial<Project>, onFlush: () => void) {
    const existing = this.entries.get(key)
    if (existing) window.clearTimeout(existing.timer)
    const merged = existing && existing.kind === 'project' ? { ...existing.patch, ...patch } : patch
    const timer = window.setTimeout(onFlush, TEXT_DEBOUNCE_MS)
    this.entries.set(key, { kind: 'project', uid, id, patch: merged, timer })
  }

  /**
   * Schedule a server mutation after the 6s undo window. If an earlier delayed action
   * is still pending, flush it immediately so replacing the toast never silently cancels it.
   */
  scheduleDelayed(execute: () => void, revert: () => void): () => void {
    this.flushDelayed()
    const entry: DelayedServerAction = {
      timer: window.setTimeout(() => {
        if (this.delayed !== entry) return
        this.delayed = null
        execute()
      }, UNDO_SERVER_DELAY_MS),
      send: execute,
      undo: revert,
    }
    this.delayed = entry
    return () => {
      if (this.delayed !== entry) return
      window.clearTimeout(entry.timer)
      this.delayed = null
      entry.undo()
    }
  }

  flushDelayed() {
    const entry = this.delayed
    if (!entry) return
    window.clearTimeout(entry.timer)
    this.delayed = null
    entry.send()
  }

  clearDelayed() {
    if (!this.delayed) return
    window.clearTimeout(this.delayed.timer)
    this.delayed = null
  }
}
