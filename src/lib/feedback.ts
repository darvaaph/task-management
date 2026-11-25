/** Optional sound and vibration. Both are off unless the user turns them on in the profile. */

export interface FeedbackPrefs { sound?: boolean; haptics?: boolean }

// Vibration API exists on Android browsers; iOS Safari has none, so the switch is hidden there.
export const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

let ctx: AudioContext | null = null

/** A short, soft rising tick, synthesised so there is no audio file to ship. */
function tick() {
  try {
    ctx ??= new AudioContext()
    // Browsers start audio suspended until a user gesture; completing a task is one.
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(880, t)
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.08)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.2)
  } catch { /* no audio available */ }
}

/** 'done' = a task was completed (sound + vibration); 'arm' = a swipe passed its threshold (vibration only). */
export function feedback(kind: 'done' | 'arm', prefs: FeedbackPrefs) {
  if (kind === 'done' && prefs.sound) tick()
  if (prefs.haptics && canVibrate) navigator.vibrate(kind === 'done' ? 12 : 8)
}
