import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { capAuthStartupRequests } from './auth/startupFetch';

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

// Sign-in uses a redirect, which on Safari / Home Screen apps only works
// when authDomain is the same site that serves the app. Firebase Hosting
// serves /__/auth/handler on every Hosting domain, so in production use
// the current host. On localhost keep the configured firebaseapp.com.
function authDomain(): string {
  const host = window.location.host;
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return env.PROD && !isLocal ? host : env.VITE_FIREBASE_AUTH_DOMAIN;
}

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: authDomain(),
  projectId: useEmulators ? 'demo-grocery' : env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

// Weak signal: don't let Auth's startup check of the saved user hang for
// 30 s (see startupFetch.ts). Must be set up before initializeAuth.
const releaseAuthStartup = capAuthStartupRequests();

// Persist the session in IndexedDB so the Home Screen app stays signed in.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
void auth.authStateReady().finally(releaseAuthStartup);

// Offline cache: must be the first Firestore call.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Must match the region in functions/src/index.ts.
export const functions = getFunctions(app, 'asia-southeast1');

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
