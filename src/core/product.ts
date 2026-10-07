/** An Expiry Date as a calendar day, 'YYYY-MM-DD'. No time or zone. */
export type IsoDate = string;

export type ShoppingListEntry = {
  buyQuantity: number;
  checkedOff: boolean;
};

/**
 * A Product as stored. Every field is always present (null, not missing)
 * so it maps 1:1 to a Firestore doc, which rejects undefined.
 */
export type Product = {
  id: string;
  name: string;
  /** Inventory count: whole number, never below 0. */
  count: number;
  /** Zero or more Barcodes. A Barcode belongs to at most one Product. */
  barcodes: string[];
  /** Low Stock Threshold, or null when off (the default). */
  lowStockThreshold: number | null;
  /** Soonest Expiry Date at home. Cleared when count reaches 0. */
  expiryDate: IsoDate | null;
  /** From Open Food Facts only. */
  photoUrl: string | null;
  /** Set when count drops from 1 or more to 0. */
  outOfStock: boolean;
  /** Hidden from the Out of Stock section. */
  dismissed: boolean;
  /** On the Shopping List, or null when not. */
  shoppingList: ShoppingListEntry | null;
  /** When the Product joined the Catalog (ISO timestamp from the clock). */
  addedAt: string;
};

/**
 * Reads a stored Product doc, filling defaults for fields an older doc may
 * lack. Keeps old data readable as later tickets add fields.
 */
export function productFromData(id: string, data: { readonly [field: string]: unknown }): Product {
  const entry = data.shoppingList as { buyQuantity?: unknown; checkedOff?: unknown } | null | undefined;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    count: typeof data.count === 'number' ? data.count : 0,
    barcodes: Array.isArray(data.barcodes) ? data.barcodes : [],
    lowStockThreshold: typeof data.lowStockThreshold === 'number' ? data.lowStockThreshold : null,
    expiryDate: typeof data.expiryDate === 'string' ? data.expiryDate : null,
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
    outOfStock: data.outOfStock === true,
    dismissed: data.dismissed === true,
    shoppingList:
      entry && typeof entry === 'object'
        ? { buyQuantity: Number(entry.buyQuantity) || 1, checkedOff: entry.checkedOff === true }
        : null,
    addedAt: typeof data.addedAt === 'string' ? data.addedAt : '',
  };
}
