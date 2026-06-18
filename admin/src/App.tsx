import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  adminFetch,
  getToken,
  clearToken,
  adminLogin,
  type AdminUser,
} from "./lib/api";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ModerationPage } from "./pages/ModerationPage";
import { UsersPage } from "./pages/UsersPage";
import { SafePlacesPage } from "./pages/SafePlacesPage";
import { EventsPage } from "./pages/EventsPage";
import { AdCampaignsPage } from "./pages/AdCampaignsPage";

const NAV_ITEMS = [
  { path: "/communities", label: "Społeczności", element: <CommunitiesPage /> },
  { path: "/reports", label: "Zgłoszenia", element: <ReportsPage /> },
  { path: "/moderation", label: "Moderacja", element: <ModerationPage /> },
  { path: "/users", label: "Użytkownicy", element: <UsersPage /> },
  {
    path: "/safe-places",
    label: "Bezpieczne miejsca",
    element: <SafePlacesPage />,
  },
  { path: "/events", label: "Wydarzenia", element: <EventsPage /> },
  {
    path: "/ad-campaigns",
    label: "Kampanie reklamowe",
    element: <AdCampaignsPage />,
  },
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

// Admin email/password sign-in. Posts to POST /api/admin/login, which only
// returns a session for a verified platform admin. The error copy is generic
// (never "you're not an admin") so the form reveals nothing about who is an
// admin. The token is persisted by adminLogin on success.
function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (admin: AdminUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const admin = await adminLogin(email.trim().toLowerCase(), password);
      onAuthenticated(admin);
    } catch {
      setError("Nieprawidłowe dane logowania.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.centered}>
      <form style={styles.loginCard} onSubmit={handleSubmit}>
        <h1 style={styles.brand}>Blis-Q</h1>
        <p style={styles.loginHint}>Panel administracyjny</p>
        <input
          style={styles.input}
          type="email"
          placeholder="E-mail"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Hasło"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          type="submit"
          style={styles.primaryButton}
          disabled={submitting}
        >
          {submitting ? "Logowanie…" : "Zaloguj się"}
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
