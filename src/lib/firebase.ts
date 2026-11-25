import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

export {
  GoogleAuthProvider,
  collection,
  deleteDoc,
  doc,
  firebaseSignOut,
  getRedirectResult,
  onAuthStateChanged,
  onSnapshot,
  serverTimestamp,
  setDoc,
  signInWithPopup,
  signInWithRedirect,
  updateDoc,
  writeBatch,
}

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

const firebaseConfig: FirebaseOptions = useEmulators
  ? {
      // Placeholder values satisfy SDK validation when talking only to local emulators.
      apiKey: 'demo-api-key',
      authDomain: 'demo-taskflow.firebaseapp.com',
      projectId: 'demo-taskflow',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

const isNewApp = getApps().length === 0
export const app = isNewApp ? initializeApp(firebaseConfig) : getApp()
export const auth = getAuth(app)
export const db = isNewApp
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : getFirestore(app)

// Guard emulator wiring so Vite HMR reloads do not connect twice.
// Match the page hostname (localhost vs 127.0.0.1) so Auth redirect/popup stays same-site under storage partitioning.
if (useEmulators && isNewApp) {
  const host = typeof location !== 'undefined' && location.hostname === 'localhost' ? 'localhost' : '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`)
  connectFirestoreEmulator(db, host, 8080)
}
