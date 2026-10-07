// Cloud Functions entry point. Thin wrappers; the logic is in notify.ts.
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { fcmSender } from './fcm';
import { isAllowListed, runHourly, sendTestPush as sendTestPushTo } from './notify';

initializeApp();
// The app calls sendTestPush in this region (src/data/notifications.ts).
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 1 });

/** Every hour on the hour (Manila): sends due expiry and Shopping Day pushes. */
export const hourlyNotifications = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Asia/Manila',
    retryCount: 0,
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (event) => {
    // scheduleTime is the planned time, so a late or repeated run still
    // counts as the same hour. Missing when run by hand.
    const now = event.scheduleTime ? new Date(event.scheduleTime) : new Date();
    await runHourly(getFirestore(), now, fcmSender(getMessaging()));
  },
);

/** "Send test push" in Settings: pushes to the caller's own devices. */
export const sendTestPush = onCall(async (request) => {
  const db = getFirestore();
  if (!request.auth || !(await isAllowListed(db, request.auth.token))) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  return sendTestPushTo(db, request.auth.uid, fcmSender(getMessaging()));
});
