import type { AccountStorage, Change } from './ports';
import type { Product } from './product';

/** In-memory storage. Used in tests; also handy for prototypes. */
export function createMemoryStorage(initial: Product[] = []): AccountStorage {
  let products: readonly Product[] = initial;
  let nextId = 1;
  const listeners = new Set<() => void>();

  return {
    products: () => products,
    commit(changes: Change[]) {
      const byId = new Map(products.map((p) => [p.id, p]));
      for (const change of changes) {
        if (change.kind === 'putProduct') byId.set(change.product.id, change.product);
        else byId.delete(change.productId);
      }
      products = [...byId.values()];
      listeners.forEach((listener) => listener());
    },
    newId: () => `product-${nextId++}`,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
