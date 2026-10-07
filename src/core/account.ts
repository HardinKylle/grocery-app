// The Account core: pure domain rules from GLOSSARY.md.
// No UI or Firebase code belongs in src/core.

import type { AccountStorage, BarcodeLookup, Clock } from './ports';
import { toCentavos, toPesos, validPrice } from './price';
import { newEntry, type IsoDate, type Product, type ShoppingListEntry } from './product';
import {
  createScanCommands,
  linkChanges,
  normalizeBarcode,
  type ScanCommands,
} from './scanning';

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
  /**
   * Estimated cost of the Shopping List: Price × buy quantity summed over
   * entries with a Price (checked off or not), and how many have no Price.
   */
  shoppingListEstimate(): { total: number; unpriced: number };
  /** Low Stock Products: count above 0 and at or below their threshold. Sorted by name. */
  lowStock(): Product[];
  /**
   * Out of Stock Products to show: not dismissed. Products on the Shopping
   * List are included (shown marked "On list"). Sorted by name.
   */
  outOfStock(): Product[];
  /** Every Product, sorted by name. `search` matches part of the name. */
  catalog(search?: string): Product[];
  /**
   * The Catalog's add-a-Product form: creates a Product at count 0 (not in
   * the Inventory, not Out of Stock), with an optional Price and Barcode, and
   * returns its id. Throws on a blank name, a bad Price, or a bad Barcode.
   */
  addProduct(input: { name: string; price?: number | null; barcode?: string | null }): string;
  /**
   * The Catalog's "Add to Inventory": adds `count` whole units (at least 1)
   * to the Product's Inventory count, creating the entry if needed, and sets
   * the Expiry Date to `expiryDate` (null = none). Throws on a bad date.
   */
  addToInventory(productId: string, count: number, expiryDate: IsoDate | null): void;
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
  /**
   * Puts a Catalog Product on the Shopping List with `quantity` (default 1,
   * whole, at least 1). If it is already on the list, adds to its buy
   * quantity, unless checked off (that buy quantity is locked).
   */
  addToShoppingList(productId: string, quantity?: number): void;
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
    shoppingListEstimate() {
      let centavos = 0;
      let unpriced = 0;
      for (const p of storage.products()) {
        if (!p.shoppingList) continue;
        if (p.price === null) unpriced++;
        else centavos += toCentavos(p.price) * p.shoppingList.buyQuantity;
      }
      return { total: toPesos(centavos), unpriced };
    },
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
          .filter((p) => p.outOfStock && !p.dismissed),
      ),
    catalog(search = '') {
      const needle = search.trim().toLowerCase();
      return byName(storage.products().filter((p) => p.name.toLowerCase().includes(needle)));
    },

    addProduct({ name, price = null, barcode = null }) {
      const product = { ...newProduct(name, 0), price: price === null ? null : validPrice(price) };
      storage.commit(
        barcode === null
          ? [{ kind: 'putProduct', product }]
          : linkChanges(storage.products(), product, normalizeBarcode(barcode)),
      );
      return product.id;
    },

    addToInventory(productId, count, expiryDate) {
      checkExpiryDate(expiryDate);
      const added = wholeCount(count);
      const product = find(productId);
      if (!product || !added) return;
      put({ ...withCount(product, product.count + added), expiryDate });
    },

    addToShoppingListByName(name) {
      const wanted = productName(name).toLowerCase();
      const existing = storage.products().find((p) => p.name.toLowerCase() === wanted);
      const product = existing ?? newProduct(name, 0);
      if (!product.shoppingList) {
        put({ ...product, shoppingList: newEntry(1) });
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
      checkExpiryDate(date);
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

    addToShoppingList(productId, quantity = 1) {
      const added = wholeCount(quantity);
      const product = find(productId);
      if (!product || !added) return;
      const entry = product.shoppingList;
      // Locked while checked off: un-check must subtract what was added.
      if (entry?.checkedOff) return;
      const buyQuantity = (entry?.buyQuantity ?? 0) + added;
      put({ ...product, shoppingList: newEntry(buyQuantity) });
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
              shoppingList: {
                ...entry,
                checkedOff: true,
                beforeCheckOff: {
                  count: product.count,
                  expiryDate: product.expiryDate,
                  outOfStock: product.outOfStock,
                  dismissed: product.dismissed,
                },
              },
            },
      );
    },

    uncheck(productId) {
      changeEntry(productId, (product, entry) => {
        if (!entry.checkedOff) return product;
        const before = entry.beforeCheckOff;
        const count = Math.max(0, product.count - entry.buyQuantity);
        return {
          // Back where it was before the check-off: put back the stock state
          // too, so a Product never at home is not made Out of Stock and a
          // dismiss is kept. If the count moved since, the count rules apply.
          ...(before?.count === count ? { ...product, ...before } : withCount(product, count)),
          shoppingList: newEntry(entry.buyQuantity),
        };
      });
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

/** Throws unless `date` is null or a 'YYYY-MM-DD' calendar day. */
function checkExpiryDate(date: IsoDate | null) {
  if (date !== null && !isIsoDate(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
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
