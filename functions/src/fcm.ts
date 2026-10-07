import { logger } from 'firebase-functions';
import type { Messaging } from 'firebase-admin/messaging';
import type { Sender } from './notify';

// Errors that mean the token will never work again, so it can be deleted.
const STALE = ['registration-token-not-registered', 'invalid-registration-token'];

/**
 * Sends through FCM as a data-only web push. The app's own service worker
 * (src/sw.ts) shows every push as a notification, which iOS requires.
 *
 * Uses registration tokens from getToken(). The newer FID API
 * (register()/fids) is not used yet: it is new and untested on iOS.
 */
export function fcmSender(messaging: Messaging): Sender {
  return async (tokens, message) => {
    const response = await messaging.sendEachForMulticast({
      tokens,
      // Data values must be strings.
      data: { kind: message.kind, title: message.title, body: message.body, route: message.route },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } },
    });
    const staleTokens: string[] = [];
    const otherErrors: string[] = [];
    response.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (!code) return;
      if (STALE.some((s) => code.endsWith(s))) staleTokens.push(tokens[i]);
      else otherErrors.push(code);
    });
    if (otherErrors.length > 0) logger.warn('Some pushes failed', { codes: otherErrors });
    return { staleTokens, delivered: response.successCount };
  };
}
