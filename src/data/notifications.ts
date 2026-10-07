import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type NotificationSettings,
} from '../core/notifications';
import { app, db, functions } from '../firebase';

const settingsRef = (uid: string) => doc(db, 'accounts', uid, 'settings', 'notifications');

/** The Account's notification settings, live. Defaults until loaded. */
export function useNotificationSettings(uid: string): NotificationSettings {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(
    () =>
      onSnapshot(
        settingsRef(uid),
        (snap) => setSettings(parseSettings(snap.data())),
        (error) => console.error('Settings listener failed', error),
      ),
    [uid],
  );
  return settings;
}

/** Saves settings. Not awaited: lands in the offline cache at once. */
export function saveNotificationSettings(uid: string, settings: NotificationSettings): void {
  setDoc(settingsRef(uid), settings).catch((error: unknown) =>
    console.error('Saving settings failed', error),
  );
}

export type PushSupport = 'unsupported' | 'default' | 'granted' | 'denied';

/**
 * Whether this browser can get pushes. On iPhone, only the Home Screen app
 * (iOS 16.4+) has Notification and PushManager; a Safari tab does not.
 */
export function pushSupport(): PushSupport {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'unsupported' | 'noVapidKey' | 'failed'; error?: unknown };

/**
 * Asks for permission and saves this device's push token to the Account.
 * Must be called straight from a tap: iOS only shows the prompt when
 * requestPermission is the first thing awaited in the gesture.
 */
export async function enableNotifications(uid: string): Promise<EnableResult> {
  if (pushSupport() === 'unsupported') return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };
  return saveDeviceToken(uid);
}

/**
 * Re-saves this device's token when permission is already granted. Called
 * on app start so a token that changed is picked up.
 */
export function useDeviceTokenRefresh(uid: string): void {
  useEffect(() => {
    if (pushSupport() !== 'granted') return;
    saveDeviceToken(uid).then((result) => {
      if (!result.ok && result.reason === 'failed') {
        console.error('Refreshing push token failed', result.error);
      }
    });
  }, [uid]);
}

async function saveDeviceToken(uid: string): Promise<EnableResult> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return { ok: false, reason: 'noVapidKey' };
  try {
    // Loaded only when needed, to keep the first load small.
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
    // Our own worker (src/sw.ts) handles pushes; no firebase-messaging-sw.js.
    const serviceWorkerRegistration = await navigator.serviceWorker.ready;
    // getToken is marked deprecated in favor of register()/FIDs, but it is
    // the long-proven path for iOS web push. See functions/src/fcm.ts.
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration });
    await setDoc(doc(db, 'accounts', uid, 'devices', token), {
      token,
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'failed', error };
  }
}

/** Asks the server to push to this Account's devices. Returns how many. */
export async function sendTestPush(): Promise<number> {
  const call = httpsCallable<void, { devices: number }>(functions, 'sendTestPush');
  return (await call()).data.devices;
}

/**
 * Follows notification taps while the app is open: the service worker
 * posts the screen to open (src/sw.ts, notificationclick).
 */
export function useNotificationRoutes(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && typeof event.data.route === 'string') {
        navigate(event.data.route);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
