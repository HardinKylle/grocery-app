import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '../auth/AuthProvider';
import { MAX_EXPIRY_LEAD_DAYS, type NotificationSettings } from '../core/notifications';
import {
  enableNotifications,
  pushSupport,
  saveNotificationSettings,
  sendTestPush,
  useNotificationSettings,
  type EnableResult,
} from '../data/notifications';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

export function SettingsScreen({ user }: { user: User }) {
  const { signOut } = useAuth();
  return (
    <section>
      <h1>Settings</h1>
      <NotificationSettingsForm uid={user.uid} />
      <PushControls uid={user.uid} />
      <h2 className="settings-heading">Account</h2>
      <p className="muted">Signed in as {user.email}</p>
      <button className="button-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </section>
  );
}

function NotificationSettingsForm({ uid }: { uid: string }) {
  const settings = useNotificationSettings(uid);
  const save = (change: Partial<NotificationSettings>) =>
    saveNotificationSettings(uid, { ...settings, ...change });

  return (
    <div className="editor">
      <div className="field">
        <label htmlFor="shopping-day">Shopping Day</label>
        <select
          id="shopping-day"
          value={settings.shoppingDay ?? ''}
          onChange={(e) =>
            save({ shoppingDay: e.target.value === '' ? null : Number(e.target.value) })
          }
        >
          <option value="">Not set</option>
          {WEEKDAYS.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="notify-hour">Notification time (Philippine time)</label>
        <select
          id="notify-hour"
          value={settings.notifyHour}
          onChange={(e) => save({ notifyHour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {hourLabel(hour)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="lead-days">Warn this many days before expiry</label>
        <input
          id="lead-days"
          key={settings.expiryLeadDays}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_EXPIRY_LEAD_DAYS}
          step={1}
          defaultValue={settings.expiryLeadDays}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const n = Math.floor(Number(e.currentTarget.value));
            if (e.currentTarget.value.trim() === '' || !Number.isFinite(n)) {
              e.currentTarget.value = String(settings.expiryLeadDays);
              return;
            }
            const days = Math.min(MAX_EXPIRY_LEAD_DAYS, Math.max(0, n));
            if (days !== settings.expiryLeadDays) save({ expiryLeadDays: days });
            else e.currentTarget.value = String(days);
          }}
        />
        <span className="muted small">0 means on the day itself. Expired Products are always listed.</span>
      </div>
    </div>
  );
}

const enableMessages: Record<Exclude<EnableResult, { ok: true }>['reason'], string> = {
  denied:
    'Notifications are blocked. Turn them on in iOS Settings > Notifications > Grocery, then try again.',
  unsupported:
    'This browser cannot get notifications. On iPhone, add the app to the Home Screen (iOS 16.4 or later) and open it from the icon.',
  noVapidKey: 'Push is not set up yet: the Web Push key is missing from this build.',
  failed: 'Could not turn on notifications. Check your connection and try again.',
};

function PushControls({ uid }: { uid: string }) {
  const [support, setSupport] = useState(pushSupport);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onEnable() {
    // Nothing may be awaited before the permission prompt (iOS).
    setBusy(true);
    const result = await enableNotifications(uid);
    setBusy(false);
    setSupport(pushSupport());
    if (result.ok) setMessage({ text: 'Notifications are on for this device.', error: false });
    else {
      if (result.error) console.error('Enable notifications failed', result.error);
      setMessage({ text: enableMessages[result.reason], error: true });
    }
  }

  async function onTest() {
    setBusy(true);
    setMessage(null);
    try {
      const devices = await sendTestPush();
      setMessage(
        devices === 0
          ? { text: 'No device saved yet. Tap Enable notifications first.', error: true }
          : { text: `Test push sent to ${devices} device${devices === 1 ? '' : 's'}.`, error: false },
      );
    } catch (error) {
      console.error('Test push failed', error);
      setMessage({ text: 'Could not send the test push. Check your connection.', error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="editor">
      {support === 'unsupported' && <p className="muted small">{enableMessages.unsupported}</p>}
      {support === 'denied' && <p className="muted small">{enableMessages.denied}</p>}
      {support === 'granted' && !message && (
        <p className="muted small">Notifications are allowed on this device.</p>
      )}
      <div className="row">
        <button
          className="button-primary"
          onClick={() => void onEnable()}
          disabled={busy || support === 'unsupported'}
        >
          Enable notifications
        </button>
        <button className="button-secondary" onClick={() => void onTest()} disabled={busy}>
          Send test push
        </button>
      </div>
      {message && (
        <p className={message.error ? 'notice notice-error' : 'notice'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
