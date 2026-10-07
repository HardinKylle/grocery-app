import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { SignInScreen } from './screens/SignInScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShoppingListScreen } from './screens/ShoppingListScreen';
import { InventoryScreen } from './screens/InventoryScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import { AccountProvider } from './data/AccountProvider';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}

function Gate() {
  const { state } = useAuth();
  if (state.status === 'loading') return <main className="loading">Loading…</main>;
  if (state.status === 'signedOut') {
    return <SignInScreen refusedEmail={state.refusedEmail} error={state.error} />;
  }
  return <Shell user={state.user} />;
}

const tabs = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/shopping-list', label: 'Shopping List' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/settings', label: 'Settings' },
];

function Shell({ user }: { user: User }) {
  return (
    <AccountProvider uid={user.uid}>
      <div className="shell">
        <main className="content">
          <Routes>
            <Route path="/inventory" element={<InventoryScreen />} />
            <Route path="/shopping-list" element={<ShoppingListScreen />} />
            <Route path="/catalog" element={<CatalogScreen />} />
            <Route path="/settings" element={<SettingsScreen user={user} />} />
            <Route path="*" element={<Navigate to="/inventory" replace />} />
          </Routes>
        </main>
        <nav className="tabs" aria-label="Main">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className="tab">
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </AccountProvider>
  );
}
