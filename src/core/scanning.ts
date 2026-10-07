// Barcode and Scan Mode rules. Part of the Account core; createAccount
// mixes these commands in.

import type { AccountStorage, BarcodeLookup, Change, LookupHit } from './ports';
import type { Product } from './product';

/** Where scans go. */
export type ScanMode = 'inventory' | 'shoppingList';

/**
 * What a scan did. Inventory mode: +1 count. Shopping List mode: put on the
 * list, +1 buy quantity, or nothing when the entry is already checked off.
 */
export type ScanEffect = 'countUp' | 'addedToList' | 'buyQuantityUp' | 'alreadyCheckedOff';

export type ScanApplied = {
  kind: 'applied';
  product: Product;
  effect: ScanEffect;
  /** Reverses the scan's effect, if nothing else changed it since. */
  undo(): void;
};

/**
 * A Barcode no Product has. Nothing is saved yet: the owner confirms or
 * edits the suggestion, links an existing Product, or types a name.
 */
export type ScanUnknown = {
  kind: 'unknown';
  barcode: string;
  /** 'offline' also covers a lookup that failed (timeout, no signal). */
  lookup: 'found' | 'notFound' | 'offline';
  suggestion: LookupHit | null;
};

export type ScanResult = ScanApplied | ScanUnknown;

export type ScanCommands = {
  /**
   * Handles a scanned Barcode in the chosen Scan Mode. A known Barcode is
   * applied at once; an unknown one is looked up and nothing is saved.
   * Throws (rejects) when the code is not a Barcode.
   */
  scan(barcode: string, mode: ScanMode): Promise<ScanResult>;
  /**
   * Finishes a scan of an unknown Barcode: saves it on a new Product (the
   * confirmed or typed name, plus any photo), or on an existing one, then
   * applies the Scan Mode. A typed name that matches a Catalog Product
   * (ignoring case) uses that Product. Throws if the name is blank.
   */
  resolveScan(barcode: string, mode: ScanMode, choice: ScanChoice): ScanApplied;
  /**
   * Links a Barcode to a Product. A Barcode belongs to at most one Product,
   * so it is taken off any other Product in the same write.
   */
  linkBarcode(productId: string, barcode: string): void;
  /** Takes a Barcode off a Product; the next scan of it is unknown. */
  unlinkBarcode(productId: string, barcode: string): void;
};

/** How the owner settled an unknown Barcode. */
export type ScanChoice =
  | { name: string; photoUrl?: string | null }
  | { productId: string; photoUrl?: string | null };

/** What scanning needs from createAccount. */
export type ScanDeps = {
  storage: AccountStorage;
  barcodeLookup: BarcodeLookup;
  find(productId: string): Product | undefined;
  /** A new, unsaved Product. Throws if the name is blank. */
  newProduct(name: string, count: number): Product;
  /** The only way scanning changes a count, so count rules stay in one place. */
  withCount(product: Product, count: number): Product;
};

export function createScanCommands({
  storage,
  barcodeLookup,
  find,
  newProduct,
  withCount,
}: ScanDeps): ScanCommands {
  function put(product: Product) {
    storage.commit([{ kind: 'putProduct', product }]);
  }

  function owner(barcode: string): Product | undefined {
    return storage.products().find((p) => p.barcodes.includes(barcode));
  }

  // Puts back the count state from before a scan. Restores the flags too,
  // so an undone 0 -> 1 scan does not look like a drop to Out of Stock.
  function restoreCount(before: Product, countAfterScan: number) {
    const current = find(before.id);
    if (!current || current.count !== countAfterScan) return;
    put({
      ...current,
      count: before.count,
      expiryDate: before.expiryDate,
      outOfStock: before.outOfStock,
      dismissed: before.dismissed,
    });
  }

  // What one scan does to a Product in each Scan Mode.
  function applyMode(product: Product, mode: ScanMode): { product: Product; effect: ScanEffect } {
    if (mode === 'inventory') {
      return { product: withCount(product, product.count + 1), effect: 'countUp' };
    }
    const entry = product.shoppingList;
    if (!entry) {
      return {
        product: { ...product, shoppingList: { buyQuantity: 1, checkedOff: false } },
        effect: 'addedToList',
      };
    }
    // The buy quantity is locked once checked off (un-check subtracts it).
    if (entry.checkedOff) return { product, effect: 'alreadyCheckedOff' };
    return {
      product: { ...product, shoppingList: { ...entry, buyQuantity: entry.buyQuantity + 1 } },
      effect: 'buyQuantityUp',
    };
  }

  function undoFor(before: Product, after: Product, effect: ScanEffect): () => void {
    switch (effect) {
      case 'countUp':
        return () => restoreCount(before, after.count);
      case 'addedToList':
        return () => {
          const current = find(before.id);
          if (current?.shoppingList && !current.shoppingList.checkedOff) {
            put({ ...current, shoppingList: null });
          }
        };
      case 'buyQuantityUp':
        return () => {
          const current = find(before.id);
          const entry = current?.shoppingList;
          if (!current || !entry || entry.checkedOff) return;
          if (entry.buyQuantity !== after.shoppingList?.buyQuantity) return;
          put({ ...current, shoppingList: { ...entry, buyQuantity: entry.buyQuantity - 1 } });
        };
      case 'alreadyCheckedOff':
        return () => {};
    }
  }

  async function lookUp(barcode: string): Promise<ScanUnknown> {
    const unknown = (lookup: ScanUnknown['lookup'], suggestion: LookupHit | null = null) =>
      ({ kind: 'unknown', barcode, lookup, suggestion }) as const;
    if (!barcodeLookup.isOnline()) return unknown('offline');
    try {
      const hit = await barcodeLookup.lookup(barcode);
      return hit ? unknown('found', hit) : unknown('notFound');
    } catch {
      return unknown('offline');
    }
  }

  // Applies the Scan Mode to a Product that now has this Barcode, in one
  // batch with taking the Barcode off any other Product.
  function applyWithBarcode(product: Product, barcode: string, mode: ScanMode): ScanApplied {
    const before = withBarcode(product, barcode);
    const { product: after, effect } = applyMode(before, mode);
    storage.commit(linkChanges(storage.products(), after, barcode));
    return { kind: 'applied', product: after, effect, undo: undoFor(before, after, effect) };
  }

  return {
    // Lookup order: the Account's own Barcodes, then Open Food Facts, then
    // the owner types a name. Offline skips Open Food Facts.
    async scan(raw, mode) {
      const barcode = normalizeBarcode(raw);
      const product = owner(barcode);
      if (!product) return lookUp(barcode);
      const { product: updated, effect } = applyMode(product, mode);
      if (updated !== product) put(updated);
      return { kind: 'applied', product: updated, effect, undo: undoFor(product, updated, effect) };
    },

    resolveScan(raw, mode, choice) {
      const barcode = normalizeBarcode(raw);
      if ('productId' in choice) {
        const product = find(choice.productId);
        if (!product) throw new Error(`No Product ${choice.productId}`);
        return applyWithBarcode(withPhoto(product, choice.photoUrl), barcode, mode);
      }
      const fresh = newProduct(choice.name, 0);
      const wanted = fresh.name.toLowerCase();
      const existing = storage.products().find((p) => p.name.toLowerCase() === wanted);
      const product = existing ?? fresh;
      return applyWithBarcode(withPhoto(product, choice.photoUrl), barcode, mode);
    },

    linkBarcode(productId, raw) {
      const barcode = normalizeBarcode(raw);
      const product = find(productId);
      if (!product) return;
      storage.commit(linkChanges(storage.products(), product, barcode));
    },

    unlinkBarcode(productId, raw) {
      const barcode = normalizeBarcode(raw);
      const product = find(productId);
      if (!product?.barcodes.includes(barcode)) return;
      put(withoutBarcode(product, barcode));
    },
  };
}

/**
 * The one stored form of a Barcode: digits only, with a 12-digit UPC-A
 * padded to its 13-digit EAN form, so both reads match. Throws when the
 * code is not 6 to 14 digits.
 */
export function normalizeBarcode(raw: string): string {
  const code = raw.trim();
  if (!/^\d{6,14}$/.test(code)) throw new Error(`Not a Barcode: ${raw}`);
  return code.length === 12 ? `0${code}` : code;
}

/**
 * One batch that saves `product` with the Barcode and takes the Barcode off
 * every other Product (a Barcode belongs to at most one Product).
 */
export function linkChanges(
  products: readonly Product[],
  product: Product,
  barcode: string,
): Change[] {
  return [
    ...products
      .filter((p) => p.id !== product.id && p.barcodes.includes(barcode))
      .map((p): Change => ({ kind: 'putProduct', product: withoutBarcode(p, barcode) })),
    { kind: 'putProduct', product: withBarcode(product, barcode) },
  ];
}

function withBarcode(product: Product, barcode: string): Product {
  if (product.barcodes.includes(barcode)) return product;
  return { ...product, barcodes: [...product.barcodes, barcode] };
}

function withoutBarcode(product: Product, barcode: string): Product {
  return { ...product, barcodes: product.barcodes.filter((b) => b !== barcode) };
}

/** Sets the Open Food Facts photo, unless the Product already has one. */
function withPhoto(product: Product, photoUrl: string | null | undefined): Product {
  if (!photoUrl || product.photoUrl) return product;
  return { ...product, photoUrl };
}
