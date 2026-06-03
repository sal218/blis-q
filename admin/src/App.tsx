import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { adminFetch, getToken, setToken, clearToken } from "./lib/api";
import { ReportsPage } from "./pages/ReportsPage";
import { ModerationPage } from "./pages/ModerationPage";
import { UsersPage } from "./pages/UsersPage";
import { SafePlacesPage } from "./pages/SafePlacesPage";
import { EventsPage } from "./pages/EventsPage";
import { AdCampaignsPage } from "./pages/AdCampaignsPage";

type AdminUser = { id: string; displayName: string; isAdmin: boolean };

const NAV_ITEMS = [
  { path: "/reports", label: "Zgłoszenia", element: <ReportsPage /> },
  { path: "/moderation", label: "Moderacja", element: <ModerationPage /> },
  { path: "/users", label: "Użytkownicy", element: <UsersPage /> },
  { path: "/safe-places", label: "Bezpieczne miejsca", element: <SafePlacesPage /> },
  { path: "/events", label: "Wydarzenia", element: <EventsPage /> },
  { path: "/ad-campaigns", label: "Kampanie reklamowe", element: <AdCampaignsPage /> },
] as const;

export function App() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false);
      return;
    }
    // Verify the stored token belongs to a platform admin. requireAdmin returns
    // 403 for non-admins, which surfaces here as a thrown error → clear token.
    adminFetch<AdminUser>("GET", "/api/admin/me")
      .then(setAdmin)
      .catch(() => clearToken())
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <p style={styles.centered}>Ładowanie…</p>;
  if (!admin) return <LoginScreen onAuthenticated={setAdmin} />;

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <h2 style={styles.brand}>Blis-Q</h2>
        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
          <span style={styles.adminName}>{admin.displayName}</span>
          <button
            type="button"
            style={styles.signOut}
            onClick={() => {
              clearToken();
              setAdmin(null);
            }}
          >
            Wyloguj
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/reports" replace />} />
          {NAV_ITEMS.map((item) => (
            <Route key={item.path} path={item.path} element={item.element} />
          ))}
          <Route path="*" element={<Navigate to="/reports" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// Scaffold sign-in: accepts a Supabase session JWT for an admin account. A full
// email/password sign-in form (producing the JWT) is wired when admin auth is
// built; the token is verified against /api/admin/me on submit.
function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (admin: AdminUser) => void;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setToken(tokenInput.trim());
    try {
      const verified = await adminFetch<AdminUser>("GET", "/api/admin/me");
      onAuthenticated(verified);
    } catch {
      clearToken();
      setError("Nieprawidłowy token lub brak uprawnień administratora.");
    }
  }

  return (
    <div style={styles.centered}>
      <form style={styles.loginCard} onSubmit={handleSubmit}>
        <h1 style={styles.brand}>Blis-Q</h1>
        <p style={styles.loginHint}>Panel administracyjny</p>
        <input
          style={styles.input}
          type="password"
          placeholder="Token sesji administratora"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" style={styles.primaryButton}>
          Zaloguj się
        </button>
      </form>
    </div>
  );
}

const INDIGO = "#4F46E5";

const styles: Record<string, CSSProperties> = {
  centered: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  layout: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  sidebar: {
    width: 240,
    background: "#0B1021",
    color: "#F5F5F7",
    display: "flex",
    flexDirection: "column",
    padding: 16,
  },
  brand: { color: INDIGO, margin: "8px 0 24px", fontSize: 24 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navLink: {
    color: "#9CA3AF",
    textDecoration: "none",
    padding: "10px 12px",
    borderRadius: 8,
  },
  navLinkActive: { color: "#FFFFFF", background: "#161B2E" },
  sidebarFooter: {
    borderTop: "1px solid #262C40",
    paddingTop: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  adminName: { fontSize: 14, color: "#9CA3AF" },
  signOut: {
    background: "transparent",
    color: "#F5F5F7",
    border: "1px solid #262C40",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
  },
  main: { flex: 1, padding: 32, background: "#F5F5F7" },
  loginCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: 320,
    padding: 32,
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    background: "#FFFFFF",
  },
  loginHint: { margin: 0, color: "#6B7280" },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #D1D5DB",
    fontSize: 14,
  },
  primaryButton: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "none",
    background: INDIGO,
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#DC2626", margin: 0, fontSize: 14 },
};
