import { describe, expect, it, vi } from 'vitest';
import { checkAccess } from './access';

describe('checkAccess', () => {
  it('allows the user when reading their own Account succeeds', async () => {
    await expect(checkAccess(async () => undefined)).resolves.toBe('allowed');
  });

  it('refuses the user when the rules deny the read', async () => {
    const denied = async () => {
      throw Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      });
    };
    await expect(checkAccess(denied)).resolves.toBe('refused');
  });

  it('keeps an allow-listed user in when offline', async () => {
    const offline = async () => {
      throw Object.assign(new Error('Failed to get document because the client is offline.'), {
        code: 'unavailable',
      });
    };
    await expect(checkAccess(offline)).resolves.toBe('allowed');
  });

  it('keeps the user in when the read hangs (weak signal) past the time limit', async () => {
    vi.useFakeTimers();
    try {
      const hangs = () => new Promise<never>(() => {});
      const result = checkAccess(hangs, { timeoutMs: 3000 });
      await vi.advanceTimersByTimeAsync(3000);
      await expect(result).resolves.toBe('allowed');
    } finally {
      vi.useRealTimers();
    }
  });
});
