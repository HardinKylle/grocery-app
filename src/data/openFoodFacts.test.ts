import { describe, expect, it } from 'vitest';
import { createOpenFoodFactsLookup } from './openFoodFacts';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function lookupWith(respond: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const lookup = createOpenFoodFactsLookup({
    fetch: (url, init) => {
      calls.push({ url: String(url), init });
      return respond(String(url), init);
    },
    isOnline: () => true,
  });
  return { lookup, calls };
}

describe('Open Food Facts lookup', () => {
  it('returns the name and photo of a found product', async () => {
    const { lookup, calls } = lookupWith(async () =>
      jsonResponse(200, {
        status: 1,
        product: {
          product_name: 'Nutella',
          image_front_small_url: 'https://images.openfoodfacts.org/n.jpg',
        },
      }),
    );

    expect(await lookup.lookup('3017624010701')).toEqual({
      name: 'Nutella',
      photoUrl: 'https://images.openfoodfacts.org/n.jpg',
    });
    expect(calls[0].url).toContain('/api/v2/product/3017624010701');
    expect(new Headers(calls[0].init?.headers).get('X-User-Agent')).toMatch(/^GroceryApp\//);
  });

  it('prefers the English name and allows a missing photo', async () => {
    const { lookup } = lookupWith(async () =>
      jsonResponse(200, {
        status: 1,
        product: { product_name: 'Lait', product_name_en: ' Milk ' },
      }),
    );

    expect(await lookup.lookup('4800361339421')).toEqual({ name: 'Milk', photoUrl: null });
  });

  it('returns null when not found, even on a 404', async () => {
    const { lookup } = lookupWith(async () =>
      jsonResponse(404, { status: 0, status_verbose: 'product not found' }),
    );

    expect(await lookup.lookup('4800361339421')).toBeNull();
  });

  it('rejects when the request fails', async () => {
    const { lookup } = lookupWith(async () => {
      throw new TypeError('Load failed');
    });

    await expect(lookup.lookup('4800361339421')).rejects.toThrow();
  });

  it('rejects instead of going over the rate limit', async () => {
    const { lookup, calls } = lookupWith(async () => jsonResponse(404, { status: 0 }));
    for (let i = 0; i < 10; i++) await lookup.lookup('4800361339421');

    await expect(lookup.lookup('4800361339421')).rejects.toThrow();
    expect(calls).toHaveLength(10);
  });
});
