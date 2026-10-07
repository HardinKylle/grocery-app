// Which push notifications are due at a given time. Pure: no Firebase.
// The hourly Cloud Function calls dueNotifications for each Account.

import { createAccount } from './account';
import { createMemoryStorage } from './memoryStorage';
import type { IsoDate, Product } from './product';

/** Per-Account notification settings. Times are Asia/Manila. */
export type NotificationSettings = {
  /** Shopping Day as a weekday, 0 = Sunday ... 6 = Saturday. Null = not set. */
  shoppingDay: number | null;
  /** Hour of the day (0-23, Manila) when notifications go out. */
  notifyHour: number;
  /** Warn about Products expiring within this many days (0 = today only). */
  expiryLeadDays: number;
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  shoppingDay: null,
  notifyHour: 8,
  expiryLeadDays: 2,
};

export const MAX_EXPIRY_LEAD_DAYS = 30;

export type NotificationKind = 'expiry' | 'shoppingDay';

/** The Manila day each kind was last sent, or null if never. */
export type LastSent = Record<NotificationKind, IsoDate | null>;

export type DueNotification = {
  kind: NotificationKind;
  /** The Manila day this notification is for. One per kind per day. */
  date: IsoDate;
  title: string;
  body: string;
  /** App screen to open when the notification is tapped. */
  route: string;
};

/**
 * Reads settings from stored data, using the default for any field that is
 * missing or out of range.
 */
export function parseSettings(data: unknown): NotificationSettings {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const whole = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
  return {
    shoppingDay: d.shoppingDay === null ? null : (whole(d.shoppingDay, 0, 6) ?? DEFAULT_SETTINGS.shoppingDay),
    notifyHour: whole(d.notifyHour, 0, 23) ?? DEFAULT_SETTINGS.notifyHour,
    expiryLeadDays: whole(d.expiryLeadDays, 0, MAX_EXPIRY_LEAD_DAYS) ?? DEFAULT_SETTINGS.expiryLeadDays,
  };
}

/** The Manila calendar day, hour, and weekday of an instant. */
export function manilaTime(now: Date): { date: IsoDate; hour: number; weekday: number } {
  // Asia/Manila is UTC+8 all year (no daylight saving).
  const shifted = new Date(now.getTime() + 8 * 3600_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * The notifications to send now. Nothing is due outside the notification
 * hour, and each kind goes out at most once per Manila day. With `retry`
 * (an earlier send today failed), any later hour of the day also counts.
 *
 * - Expiry alert: Products at home expiring within `expiryLeadDays`,
 *   including already expired. Skipped when there are none.
 * - Shopping Day message: on Shopping Day only, with the Shopping List count
 *   and the Low Stock, Out of Stock, and expiring Products.
 */
export function dueNotifications(input: {
  now: Date;
  settings: NotificationSettings;
  products: readonly Product[];
  lastSent: LastSent;
  retry?: boolean;
}): DueNotification[] {
  const { now, settings, products, lastSent, retry = false } = input;
  const today = manilaTime(now);
  const late = retry && today.hour > settings.notifyHour;
  if (today.hour !== settings.notifyHour && !late) return [];

  const expiring = expiringProducts(products, today.date, settings.expiryLeadDays);
  const due: DueNotification[] = [];

  if (expiring.length > 0 && lastSent.expiry !== today.date) {
    due.push({
      kind: 'expiry',
      date: today.date,
      title: expiring.length === 1 ? '1 Product expiring' : `${expiring.length} Products expiring`,
      body: expiring.map((p) => `${p.name} (${whenExpires(p.expiryDate!, today.date)})`).join(', '),
      route: '/inventory',
    });
  }

  if (settings.shoppingDay === today.weekday && lastSent.shoppingDay !== today.date) {
    due.push({
      kind: 'shoppingDay',
      date: today.date,
      title: 'Shopping Day',
      body: shoppingDayBody(products, expiring),
      route: '/shopping-list',
    });
  }

  return due;
}

function shoppingDayBody(products: readonly Product[], expiring: Product[]): string {
  // Same queries as the Inventory sections. Read-only, so the clock is unused.
  const account = createAccount({
    storage: createMemoryStorage([...products]),
    clock: { now: () => new Date(0) },
  });
  const toBuy = account.shoppingList().filter((p) => !p.shoppingList?.checkedOff).length;
  // Low Stock and Out of Stock Products already on the list need no reminder.
  const lowStock = account.lowStock().filter((p) => !p.shoppingList);
  const outOfStock = account.outOfStock().filter((p) => !p.shoppingList);

  const lines = [toBuy === 1 ? '1 Product on your Shopping List.' : `${toBuy} Products on your Shopping List.`];
  if (lowStock.length) lines.push(`Low Stock: ${names(lowStock)}.`);
  if (outOfStock.length) lines.push(`Out of Stock: ${names(outOfStock)}.`);
  if (expiring.length) lines.push(`Expiring: ${names(expiring)}.`);
  return lines.join('\n');
}

/** At home and expiring on or before today + leadDays. Soonest first. */
function expiringProducts(products: readonly Product[], today: IsoDate, leadDays: number): Product[] {
  const last = addDays(today, leadDays);
  return products
    .filter((p) => p.count > 0 && p.expiryDate !== null && p.expiryDate <= last)
    .sort(
      (a, b) =>
        a.expiryDate!.localeCompare(b.expiryDate!) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

function whenExpires(expiryDate: IsoDate, today: IsoDate): string {
  const days = daysBetween(today, expiryDate);
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function names(products: Product[]): string {
  return products.map((p) => p.name).join(', ');
}
