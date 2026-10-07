// The Account core: pure domain rules from GLOSSARY.md.
// No UI or Firebase code belongs in src/core.

import type { AccountStorage, Clock } from './ports';
import type { IsoDate, Product } from './product';

export type { IsoDate, Product, ShoppingListEntry } from './product';
export type { AccountStorage, Change, Clock } from './ports';

export type Account = {
  /** Calls `listener` after any change, local or synced. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Products at home (count 1 or more), sorted by name. */
  inventory(): Product[];
  shoppingList(): Product[];
  /** Every Product, sorted by name. `search` matches part of the name. */
  catalog(search?: string): Product[];
  /** Adds a Product to the Catalog and returns its id. */
  addProductByName(name: string, count: number): string;
  increment(productId: string): void;
  decrement(productId: string): void;
  setCount(productId: string, count: number): void;
  /** Throws if the new name is blank. */
  renameProduct(productId: string, name: string): void;
  /** Removes the Product everywhere. */
  deleteProduct(productId: string): void;
  /**
   * Sets or clears (null) the Expiry Date. Ignored while the count is 0.
   * Throws if `date` is not a 'YYYY-MM-DD' calendar day.
   */
  setExpiryDate(productId: string, date: IsoDate | null): void;
};

export function createAccount({
  storage,
  clock,
}: {
  storage: AccountStorage;
  clock: Clock;
}): Account {
  function find(productId: string): Product | undefined {
    return storage.products().find((p) => p.id === productId);
  }

  function put(product: Product) {
    storage.commit([{ kind: 'putProduct', product }]);
  }

  // Every count change goes through here, so count rules live in one place.
  function changeCount(productId: string, next: (count: number) => number) {
    const product = find(productId);
    if (!product) return;
    const count = wholeCount(next(product.count));
    if (count === undefined || count === product.count) return;
    put({
      ...product,
      count,
      // Nothing left at home, so no Expiry Date to track.
      expiryDate: count === 0 ? null : product.expiryDate,
    });
  }

  return {
    subscribe: (listener) => storage.subscribe(listener),
    inventory: () => byName(storage.products().filter((p) => p.count >= 1)),
    shoppingList: () => [],
    catalog(search = '') {
      const needle = search.trim().toLowerCase();
      return byName(storage.products().filter((p) => p.name.toLowerCase().includes(needle)));
    },

    addProductByName(name, count) {
      const product: Product = {
        id: storage.newId(),
        name: productName(name),
        count: wholeCount(count) ?? 0,
        barcodes: [],
        lowStockThreshold: null,
        expiryDate: null,
        photoUrl: null,
        outOfStock: false,
        dismissed: false,
        shoppingList: null,
        addedAt: clock.now().toISOString(),
      };
      put(product);
      return product.id;
    },

    increment: (productId) => changeCount(productId, (count) => count + 1),
    decrement: (productId) => changeCount(productId, (count) => count - 1),
    setCount: (productId, count) => changeCount(productId, () => count),

    renameProduct(productId, name) {
      const product = find(productId);
      if (!product) return;
      put({ ...product, name: productName(name) });
    },

    deleteProduct(productId) {
      storage.commit([{ kind: 'deleteProduct', productId }]);
    },

    setExpiryDate(productId, date) {
      if (date !== null && !isIsoDate(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
      const product = find(productId);
      if (!product || product.count === 0) return;
      put({ ...product, expiryDate: date });
    },
  };
}

function isIsoDate(value: string): value is IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** A trimmed, non-blank Product name. Throws on blank. */
function productName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A Product needs a name.');
  return trimmed;
}

/** A whole number, at least 0. Undefined when `n` is not a number. */
function wholeCount(n: number): number | undefined {
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

function byName(products: readonly Product[]): Product[] {
  return [...products].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}
