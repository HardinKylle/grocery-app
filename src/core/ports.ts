import type { Product } from './product';

// A change the core asks storage to make. Storage applies a whole list of
// changes together (one Firestore batch). Later tickets add kinds here,
// e.g. Barcode index docs or Account settings.
export type Change =
  | { kind: 'putProduct'; product: Product }
  | { kind: 'deleteProduct'; productId: string };

/**
 * Where an Account's data lives. The Firestore adapter keeps the latest
 * snapshot in memory so reads are synchronous and work offline; the
 * in-memory fake is used in tests.
 */
export type AccountStorage = {
  /** Every Product as storage last saw it. */
  products(): readonly Product[];
  /**
   * Applies changes. Fire and forget: the local view updates at once, the
   * server catches up later (it may be offline). Never awaited by callers.
   */
  commit(changes: Change[]): void;
  /** A fresh, unique Product id. */
  newId(): string;
  /** Calls `listener` whenever products() changes. Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
};

export type Clock = {
  now(): Date;
};
