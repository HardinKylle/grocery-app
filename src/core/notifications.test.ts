import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  dueNotifications,
  parseSettings,
  type LastSent,
  type NotificationSettings,
} from './notifications';
import type { Product } from './product';

// 2026-10-07 is a Wednesday (weekday 3).
const at = (manilaTime: string) => new Date(`${manilaTime}+08:00`);

function product(name: string, fields: Partial<Product> = {}): Product {
  return {
    id: name.toLowerCase(),
    name,
    count: 1,
    barcodes: [],
    lowStockThreshold: null,
    expiryDate: null,
    photoUrl: null,
    outOfStock: false,
    dismissed: false,
    shoppingList: null,
    addedAt: '',
    ...fields,
  };
}

const nothingSent: LastSent = { expiry: null, shoppingDay: null };

function due(
  now: Date,
  products: Product[],
  settings: Partial<NotificationSettings> = {},
  lastSent: LastSent = nothingSent,
) {
  return dueNotifications({ now, settings: { ...DEFAULT_SETTINGS, ...settings }, products, lastSent });
}

describe('dueNotifications: expiry alert', () => {
  it('is due at the notification time when a Product expires within the chosen days', () => {
    const result = due(at('2026-10-07T08:00:00'), [product('Milk', { expiryDate: '2026-10-09' })]);
    expect(result).toMatchObject([{ kind: 'expiry', date: '2026-10-07', route: '/inventory' }]);
    expect(result[0].body).toContain('Milk');
  });

  const milk = product('Milk', { expiryDate: '2026-10-08' });

  it('includes Products already expired, soonest first, with when each expires', () => {
    const result = due(at('2026-10-07T08:00:00'), [
      product('Bread', { expiryDate: '2026-10-09' }),
      product('Eggs', { expiryDate: '2026-10-07' }),
      product('Cheese', { expiryDate: '2026-10-01' }),
      milk,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('4 Products expiring');
    expect(result[0].body).toBe('Cheese (expired), Eggs (today), Milk (tomorrow), Bread (in 2 days)');
  });

  it('leaves out Products expiring after the chosen days, and Products without a date', () => {
    const result = due(
      at('2026-10-07T08:00:00'),
      [milk, product('Rice', { expiryDate: '2026-10-11' }), product('Salt')],
      { expiryLeadDays: 3 },
    );
    expect(result[0].body).toBe('Milk (tomorrow)');
    expect(result[0].title).toBe('1 Product expiring');
  });

  it('is not sent when nothing is expiring', () => {
    expect(due(at('2026-10-07T08:00:00'), [product('Rice', { expiryDate: '2026-10-20' })])).toEqual([]);
  });

  it('is not due outside the notification hour', () => {
    expect(due(at('2026-10-07T07:59:00'), [milk])).toEqual([]);
    expect(due(at('2026-10-07T09:00:00'), [milk])).toEqual([]);
    expect(due(at('2026-10-07T08:59:00'), [milk])).toHaveLength(1);
  });

  it('follows the chosen notification hour in Manila time', () => {
    // 21:00 Manila is 13:00 UTC.
    expect(due(new Date('2026-10-07T13:00:00Z'), [milk], { notifyHour: 21 })).toHaveLength(1);
    expect(due(new Date('2026-10-07T21:00:00Z'), [milk], { notifyHour: 21 })).toEqual([]);
  });

  it('uses the Manila day, not the UTC day', () => {
    // 07:00 Manila on Oct 8 is still Oct 7 in UTC.
    const result = due(new Date('2026-10-07T23:00:00Z'), [milk], { notifyHour: 7 });
    expect(result).toMatchObject([{ date: '2026-10-08', body: 'Milk (today)' }]);
  });

  it('is sent at most once a day', () => {
    const now = at('2026-10-07T08:30:00');
    expect(due(now, [milk], {}, { expiry: '2026-10-07', shoppingDay: null })).toEqual([]);
    expect(due(now, [milk], {}, { expiry: '2026-10-06', shoppingDay: null })).toHaveLength(1);
  });
});

describe('dueNotifications: Shopping Day message', () => {
  const wednesday = 3;

  it('is due on Shopping Day at the notification time, opening the Shopping List', () => {
    const result = due(at('2026-10-07T08:00:00'), [], { shoppingDay: wednesday });
    expect(result).toEqual([
      {
        kind: 'shoppingDay',
        date: '2026-10-07',
        title: 'Shopping Day',
        body: '0 Products on your Shopping List.',
        route: '/shopping-list',
      },
    ]);
  });

  it('is not due on other days, or when no Shopping Day is set', () => {
    expect(due(at('2026-10-08T08:00:00'), [], { shoppingDay: wednesday })).toEqual([]);
    expect(due(at('2026-10-07T08:00:00'), [], { shoppingDay: null })).toEqual([]);
  });

  it('lists the Shopping List count, Low Stock, Out of Stock, and expiring Products', () => {
    const result = due(
      at('2026-10-07T08:00:00'),
      [
        product('Eggs', { shoppingList: { buyQuantity: 2, checkedOff: false } }),
        product('Coffee', { count: 0, shoppingList: { buyQuantity: 1, checkedOff: false } }),
        product('Bread', { shoppingList: { buyQuantity: 1, checkedOff: true } }),
        product('Rice', { count: 1, lowStockThreshold: 2 }),
        product('Oil', {
          count: 1,
          lowStockThreshold: 1,
          shoppingList: { buyQuantity: 1, checkedOff: false },
        }),
        product('Soap', { count: 0, outOfStock: true }),
        product('Salt', { count: 0, outOfStock: true, dismissed: true }),
        product('Milk', { expiryDate: '2026-10-08' }),
      ],
      { shoppingDay: wednesday },
    );
    const message = result.find((n) => n.kind === 'shoppingDay');
    // Bread is checked off; Oil is Low Stock but already on the list; Salt is dismissed.
    expect(message?.body).toBe(
      '3 Products on your Shopping List.\nLow Stock: Rice.\nOut of Stock: Soap.\nExpiring: Milk.',
    );
  });

  it('comes alongside the expiry alert on the same morning', () => {
    const result = due(at('2026-10-07T08:00:00'), [product('Milk', { expiryDate: '2026-10-08' })], {
      shoppingDay: wednesday,
    });
    expect(result.map((n) => n.kind)).toEqual(['expiry', 'shoppingDay']);
  });

  it('is sent at most once on Shopping Day', () => {
    const lastSent: LastSent = { expiry: null, shoppingDay: '2026-10-07' };
    expect(due(at('2026-10-07T08:00:00'), [], { shoppingDay: wednesday }, lastSent)).toEqual([]);
  });
});

describe('parseSettings', () => {
  it('fills defaults: no Shopping Day, 8:00 AM, 2 days before expiry', () => {
    expect(parseSettings(undefined)).toEqual({ shoppingDay: null, notifyHour: 8, expiryLeadDays: 2 });
  });

  it('keeps valid values and replaces invalid ones with the default', () => {
    expect(parseSettings({ shoppingDay: 6, notifyHour: 0, expiryLeadDays: 0 })).toEqual({
      shoppingDay: 6,
      notifyHour: 0,
      expiryLeadDays: 0,
    });
    expect(parseSettings({ shoppingDay: 7, notifyHour: 24, expiryLeadDays: -1 })).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(parseSettings({ shoppingDay: '1', notifyHour: 8.5, expiryLeadDays: 'x' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
