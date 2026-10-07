import type { User } from 'firebase/auth';
import { useAuth } from '../auth/AuthProvider';

export function SettingsScreen({ user }: { user: User }) {
  const { signOut } = useAuth();
  return (
    <section>
      <h1>Settings</h1>
      <p className="muted">Signed in as {user.email}</p>
      <button className="button-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </section>
  );
}
