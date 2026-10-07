import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function SignInScreen({ refusedEmail, error }: { refusedEmail?: string; error?: string }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await signIn();
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <h1>Grocery</h1>
      <p className="muted">Your Inventory and Shopping List.</p>

      {refusedEmail && (
        <p className="notice notice-error" role="alert">
          {refusedEmail} is not allowed to use this app. Sign in with an allowed Google account.
        </p>
      )}
      {error && !refusedEmail && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <button className="button-primary" onClick={handleSignIn} disabled={busy}>
        {busy ? 'Opening Google…' : 'Sign in with Google'}
      </button>

      {!isStandalone() && (
        <p className="muted small">
          On iPhone: tap Share, then Add to Home Screen, and open the app from there.
        </p>
      )}
    </main>
  );
}
