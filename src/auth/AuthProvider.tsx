import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { checkAccess } from './access';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; refusedEmail?: string; error?: string }
  | { status: 'signedIn'; user: User };

type AuthContextValue = {
  state: AuthState;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // Surfaces errors from a finished redirect sign-in. The user itself
    // arrives through onAuthStateChanged.
    getRedirectResult(auth).catch((error: unknown) => {
      setState({ status: 'signedOut', error: errorMessage(error) });
    });

    let refusedEmail: string | undefined;
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState((prev) =>
          prev.status === 'signedOut' && prev.error
            ? prev
            : { status: 'signedOut', refusedEmail },
        );
        return;
      }
      const access = await checkAccess(() => getDoc(doc(db, 'accounts', user.uid)));
      if (access === 'refused') {
        refusedEmail = user.email ?? 'This Google account';
        await firebaseSignOut(auth);
        return;
      }
      refusedEmail = undefined;
      setState({ status: 'signedIn', user });
    });
  }, []);

  const value: AuthContextValue = {
    state,
    signIn: () => signInWithRedirect(auth, new GoogleAuthProvider()),
    signOut: () => firebaseSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
}
