import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { user as authUser } from 'firebase-functions/v1/auth'

initializeApp()
const db = getFirestore()

/**
 * Create the server-managed profile document on first sign-up so clients cannot
 * forge plan/quota fields (docs/BACKEND.md §2.1, §3.1).
 */
export const onUserCreated = authUser().onCreate(async (user) => {
  const fallbackName = user.email ? user.email.split('@')[0] : 'Anda'
  const name = (user.displayName?.trim() || fallbackName).slice(0, 100)
  const ref = db.doc(`users/${user.uid}`)

  try {
    // Use create() so retried Auth triggers never overwrite an existing profile or plan.
    await ref.create({
      name,
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      plan: 'free',
      proSource: null,
      proSince: null,
      activeOwned: 0,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // gRPC code 6 = ALREADY_EXISTS: treat duplicate trigger delivery as a no-op.
    if (err && typeof err === 'object' && 'code' in err && err.code === 6) return
    throw err
  }
})
