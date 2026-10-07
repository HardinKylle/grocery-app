// The Account core: pure domain rules from GLOSSARY.md.
// No UI or Firebase code belongs in src/core.

import type { AccountStorage, BarcodeLookup, Clock } from './ports';
import type { IsoDate, Product, ShoppingListEntry } from './product';
import { createScanCommands, type ScanCommands } from './scanning';

export { normalizeBarcode } from './scanning';

export type { IsoDate, Product, ShoppingListEntry } from './product';
export type { AccountStorage, BarcodeLookup, Change, Clock, LookupHit } from './ports';
export type {
  ScanApplied,
  ScanChoice,
  ScanEffect,
  ScanMode,
  ScanResult,
  ScanUnknown,
} from './scanning';

export type Account = ScanCommands & {
  /** Calls `listener` after any change, local or synced. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Products at home (count 1 or more), sorted by name. */
  inventory(): Product[];
  /** Products on the Shopping List, checked off or not, sorted by name. */
  shoppingList(): Product[];
  /** Low Stock Products: count above 0 and at or below their threshold. Sorted by name. */
  lowStock(): Product[];
  /**
   * Out of Stock Products to show: not dismissed and not on the Shopping
   * List. Sorted by name.
   */
  outOfStock(): Product[];
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
  /**
   * Sets the Low Stock Threshold to a whole number of 1 or more, or turns it
   * off with null (0 also turns it off, since nothing above 0 is at or below 0).
   */
  setLowStockThreshold(productId: string, threshold: number | null): void;
  /**
   * Sets the Price in pesos, or clears it with null. Throws unless it is a
   * number of 0 or more with at most two decimals (centavos).
   */
  setPrice(productId: string, price: number | null): void;
  /**
   * Hides an Out of Stock Product from the Out of Stock section. It stays in
   * the Catalog. Ignored if the Product is not Out of Stock.
   */
  dismissOutOfStock(productId: string): void;
  /** Puts a Catalog Product on the Shopping List with a buy quantity of 1. */
  addToShoppingList(productId: string): void;
  /**
   * Adds the Catalog Product with this name (ignoring case), or creates one
   * at count 0, and puts it on the Shopping List. Returns its id. Throws if
   * the name is blank.
   */
  addToShoppingListByName(name: string): string;
  setBuyQuantity(productId: string, quantity: number): void;
  /** Adds the buy quantity to the count at once; the entry stays, crossed out. */
  checkOff(productId: string): void;
  /** Undoes a check-off: subtracts the buy quantity again (never below 0). */
  uncheck(productId: string): void;
  /** Takes the Product off the list. Any count added by a check-off stays. */
  removeFromShoppingList(productId: string): void;
  /** Ends the trip: removes checked-off entries, keeps the rest. */
  doneShopping(): void;
};

export function createAccount({
  storage,
  clock,
  barcodeLookup = offlineLookup,
}: {
  storage: AccountStorage;
  clock: Clock;
  /** Defaults to one that is always offline. */
  barcodeLookup?: BarcodeLookup;
}): Account {
  function find(productId: string): Product | undefined {
    return storage.products().find((p) => p.id === productId);
  }

  function put(product: Product) {
    storage.commit([{ kind: 'putProduct', product }]);
  }

  function newProduct(name: string, count: number): Product {
    return {
      id: storage.newId(),
      name: productName(name),
      count,
      barcodes: [],
      lowStockThreshold: null,
      expiryDate: null,
      photoUrl: null,
      price: null,
      outOfStock: false,
      dismissed: false,
      shoppingList: null,
      addedAt: clock.now().toISOString(),
    };
  }

  function changeCount(productId: string, next: (count: number) => number) {
    const product = find(productId);
    if (!product) return;
    const count = wholeCount(next(product.count));
    if (count === undefined || count === product.count) return;
    put(withCount(product, count));
  }

  // Changes only the Shopping List entry of a Product that is on the list.
  function changeEntry(
    productId: string,
    next: (product: Product, entry: ShoppingListEntry) => Product,
  ) {
    const product = find(productId);
    if (!product?.shoppingList) return;
    const updated = next(product, product.shoppingList);
    if (updated !== product) put(updated);
  }

  return {
    ...createScanCommands({ storage, barcodeLookup, find, newProduct, withCount }),
    subscribe: (listener) => storage.subscribe(listener),
    inventory: () => byName(storage.products().filter((p) => p.count >= 1)),
    shoppingList: () => byName(storage.products().filter((p) => p.shoppingList !== null)),
    lowStock: () =>
      byName(
        storage
          .products()
          .filter(
            (p) => p.lowStockThreshold !== null && p.count > 0 && p.count <= p.lowStockThreshold,
          ),
      ),
    outOfStock: () =>
      byName(
        storage
          .products()
          .filter((p) => p.outOfStock && !p.dismissed && p.shoppingList === null),
      ),
    catalog(search = '') {
      const needle = search.trim().toLowerCase();
      return byName(storage.products().filter((p) => p.name.toLowerCase().includes(needle)));
    },

    addProductByName(name, count) {
      const product = newProduct(name, wholeCount(count) ?? 0);
      put(product);
      return product.id;
    },

    addToShoppingListByName(name) {
      const wanted = productName(name).toLowerCase();
      const existing = storage.products().find((p) => p.name.toLowerCase() === wanted);
      const product = existing ?? newProduct(name, 0);
      if (!product.shoppingList) {
        put({ ...product, shoppingList: { buyQuantity: 1, checkedOff: false } });
      }
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

    setLowStockThreshold(productId, threshold) {
      const product = find(productId);
      if (!product) return;
      let next: number | null = null;
      if (threshold !== null) {
        const whole = wholeCount(threshold);
        if (whole === undefined) return;
        next = whole === 0 ? null : whole;
      }
      if (next === product.lowStockThreshold) return;
      put({ ...product, lowStockThreshold: next });
    },

    setPrice(productId, price) {
      const next = price === null ? null : validPrice(price);
      const product = find(productId);
      if (!product || product.price === next) return;
      put({ ...product, price: next });
    },

    dismissOutOfStock(productId) {
      const product = find(productId);
      if (!product?.outOfStock || product.dismissed) return;
      put({ ...product, dismissed: true });
    },

    addToShoppingList(productId) {
      const product = find(productId);
      if (!product || product.shoppingList) return;
      put({ ...product, shoppingList: { buyQuantity: 1, checkedOff: false } });
    },

    setBuyQuantity(productId, quantity) {
      const whole = wholeCount(quantity);
      if (whole === undefined) return;
      const buyQuantity = Math.max(1, whole);
      changeEntry(productId, (product, entry) =>
        // Locked while checked off: un-check must subtract what was added.
        entry.checkedOff ? product : { ...product, shoppingList: { ...entry, buyQuantity } },
      );
    },

    checkOff(productId) {
      changeEntry(productId, (product, entry) =>
        entry.checkedOff
          ? product
          : {
              ...withCount(product, product.count + entry.buyQuantity),
              shoppingList: { ...entry, checkedOff: true },
            },
      );
    },

    uncheck(productId) {
      changeEntry(productId, (product, entry) =>
        entry.checkedOff
          ? {
              ...withCount(product, Math.max(0, product.count - entry.buyQuantity)),
              shoppingList: { ...entry, checkedOff: false },
            }
          : product,
      );
    },

    removeFromShoppingList(productId) {
      changeEntry(productId, (product) => ({ ...product, shoppingList: null }));
    },

    doneShopping() {
      const checked = storage.products().filter((p) => p.shoppingList?.checkedOff);
      if (checked.length === 0) return;
      storage.commit(
        checked.map((product) => ({
          kind: 'putProduct',
          product: { ...product, shoppingList: null },
        })),
      );
    },
  };
}

const offlineLookup: BarcodeLookup = {
  isOnline: () => false,
  lookup: async () => null,
};

// Every count change goes through here, so count rules live in one place.
function withCount(product: Product, count: number): Product {
  return {
    ...product,
    count,
    // Nothing left at home, so no Expiry Date to track.
    expiryDate: count === 0 ? null : product.expiryDate,
    ...(count > 0
      ? // Stock is back: no longer Out of Stock, and a past dismiss is forgotten.
        { outOfStock: false, dismissed: false }
      : product.count > 0
        ? // Dropped from 1 or more to 0. Created-at-0 never gets here.
          { outOfStock: true, dismissed: false }
        : {}),
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

/** A Price of 0 or more pesos, in whole centavos. Throws otherwise. */
function validPrice(price: number): number {
  const centavos = Math.round(price * 100);
  if (!Number.isFinite(price) || price < 0 || Math.abs(price * 100 - centavos) > 1e-6) {
    throw new Error(`Not a Price in pesos: ${price}`);
  }
  return centavos / 100;
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
