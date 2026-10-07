import { describe, expect, it } from 'vitest';
import { checkForUpdates } from './swUpdates';

function fakes() {
  let updates = 0;
  let visibility: 'visible' | 'hidden' = 'hidden';
  const listeners: (() => void)[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const doc = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_type: 'visibilitychange', fn: () => void) => listeners.push(fn),
  };
  return {
    registration: { update: async () => void updates++ },
    doc,
    every: (fn: () => void, ms: number) => void timers.push({ fn, ms }),
    updates: () => updates,
    show() {
      visibility = 'visible';
      listeners.forEach((fn) => fn());
    },
    hide() {
      visibility = 'hidden';
      listeners.forEach((fn) => fn());
    },
    timers,
  };
}

describe('checkForUpdates', () => {
  it('checks for a new version each time the app comes back into view', () => {
    const f = fakes();
    checkForUpdates(f.registration, { doc: f.doc, every: f.every });
    f.show();
    f.hide();
    f.show();
    expect(f.updates()).toBe(2);
  });

  it('also checks hourly while open, but not while hidden', () => {
    const f = fakes();
    checkForUpdates(f.registration, { doc: f.doc, every: f.every });
    expect(f.timers.map((t) => t.ms)).toEqual([60 * 60 * 1000]);
    f.timers[0].fn();
    expect(f.updates()).toBe(0);
    f.show();
    f.timers[0].fn();
    expect(f.updates()).toBe(2);
  });

  it('ignores a failed check (no signal)', async () => {
    const f = fakes();
    const registration = { update: () => Promise.reject(new Error('offline')) };
    checkForUpdates(registration, { doc: f.doc, every: f.every });
    expect(() => f.show()).not.toThrow();
  });
});
