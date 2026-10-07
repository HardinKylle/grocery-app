import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createAccount, type Account } from '../core/account';
import { db } from '../firebase';
import { createFirestoreStorage, type FirestoreStorage } from './firestoreStorage';
import { createOpenFoodFactsLookup } from './openFoodFacts';

type AccountContextValue = { account: Account; source: FirestoreStorage };

const AccountContext = createContext<AccountContextValue | null>(null);

const systemClock = { now: () => new Date() };
const barcodeLookup = createOpenFoodFactsLookup();

/** Opens the signed-in Account's data for the screens below it. */
export function AccountProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [value, setValue] = useState<AccountContextValue | null>(null);

  // Created in an effect (not useMemo) so StrictMode's mount/unmount/mount
  // ends with a live listener.
  useEffect(() => {
    const source = createFirestoreStorage(db, uid);
    setValue({
      source,
      account: createAccount({ storage: source.storage, clock: systemClock, barcodeLookup }),
    });
    return () => source.dispose();
  }, [uid]);

  if (!value) return null;
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/**
 * The Account core, re-rendering the caller whenever its data changes.
 * `loaded` is false until the first snapshot arrives.
 */
export function useAccount(): { account: Account; loaded: boolean } {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  const { account, source } = value;
  useSyncExternalStore(account.subscribe, source.storage.products);
  return { account, loaded: source.loaded() };
}
