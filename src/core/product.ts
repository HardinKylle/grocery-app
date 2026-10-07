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
