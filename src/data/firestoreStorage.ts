import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { AccountStorage, Change, Product } from '../core/account';
import { productFromData } from '../core/product';

export type FirestoreStorage = {
  storage: AccountStorage;
  /** False until the first snapshot (cache or server) arrives. */
  loaded(): boolean;
  /** Stops listening. */
  dispose(): void;
};

/**
 * Account storage backed by Firestore at accounts/{uid}/products/{id}.
 *
 * Reads come from an onSnapshot listener, which serves the offline cache
 * when there is no signal. Writes go in one writeBatch per command and are
 * never awaited: the batch lands in the local cache at once and syncs
 * later. Changes are also applied to the in-memory list right away, so a
 * second tap before the snapshot arrives sees the first tap's result.
 */
export function createFirestoreStorage(db: Firestore, uid: string): FirestoreStorage {
  const products = collection(db, 'accounts', uid, 'products');
  let current: readonly Product[] = [];
  let isLoaded = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const unsubscribe = onSnapshot(
    products,
    (snapshot) => {
      current = snapshot.docs.map((d) => productFromData(d.id, d.data()));
      isLoaded = true;
      notify();
    },
    (error) => {
      console.error('Products listener failed', error);
      isLoaded = true;
      notify();
    },
  );

  const storage: AccountStorage = {
    products: () => current,
    commit(changes: Change[]) {
      const batch = writeBatch(db);
      const byId = new Map(current.map((p) => [p.id, p]));
      for (const change of changes) {
        if (change.kind === 'putProduct') {
          const { id, ...data } = change.product;
          batch.set(doc(products, id), data);
          byId.set(id, change.product);
        } else {
          batch.delete(doc(products, change.productId));
          byId.delete(change.productId);
        }
      }
      current = [...byId.values()];
      notify();
      batch.commit().catch((error: unknown) => console.error('Write failed', error));
    },
    newId: () => doc(products).id,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return { storage, loaded: () => isLoaded, dispose: unsubscribe };
}
