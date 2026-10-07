import { LookupUnavailable, type BarcodeLookup, type LookupHit } from '../core/account';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_en,image_front_small_url';
// Browsers will not let JS set User-Agent; OFF accepts this header instead.
const USER_AGENT = 'GroceryApp/0.1 (github.com/HardinKylle/grocery-app)';
const TIMEOUT_MS = 5000;
// OFF allows 15 product reads per minute per IP. Stay well under it.
const MAX_PER_MINUTE = 10;

/**
 * Barcode lookup on Open Food Facts. Only Barcodes the Account does not know
 * reach here. Never retries: a failure rejects, and the core then asks the
 * owner to type a name. Rate limits reject with LookupUnavailable.
 */
export function createOpenFoodFactsLookup({
  fetch: doFetch = (input, init) => fetch(input, init),
  isOnline = () => navigator.onLine,
}: {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  isOnline?: () => boolean;
} = {}): BarcodeLookup {
  const recent: number[] = [];

  return {
    isOnline,
    async lookup(barcode) {
      const now = Date.now();
      while (recent.length && now - recent[0] > 60_000) recent.shift();
      if (recent.length >= MAX_PER_MINUTE) throw new LookupUnavailable('Open Food Facts rate limit');
      recent.push(now);

      // One controller + setTimeout, not AbortSignal.timeout, for older iOS.
      // Covers "online" with no real signal in the store.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await doFetch(
          `${API}${encodeURIComponent(barcode)}?fields=${FIELDS}`,
          { signal: controller.signal, headers: { 'X-User-Agent': USER_AGENT } },
        );
        if (response.status === 429) throw new LookupUnavailable('Open Food Facts rate limit');
        // Not found is a 404 with a JSON body, so read the body either way.
        const body: unknown = await response.json().catch(() => null);
        return toHit(body);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function toHit(body: unknown): LookupHit | null {
  if (!body || typeof body !== 'object') return null;
  const { status, product } = body as { status?: unknown; product?: Record<string, unknown> };
  if (status !== 1 || !product) return null;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    name: text(product.product_name_en) || text(product.product_name),
    photoUrl: text(product.image_front_small_url) || null,
  };
}
