import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import {
  adminFetch,
  getToken,
  clearToken,
  adminLogin,
  type AdminUser,
} from "./lib/api";
import { Icon, type IconName } from "./components/Icon";
import { Alert, Button, ConfirmProvider, Field, Input } from "./components/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ModerationPage } from "./pages/ModerationPage";
import { UsersPage } from "./pages/UsersPage";
import { SafePlacesPage } from "./pages/SafePlacesPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { EventsPage } from "./pages/EventsPage";
import { AdCampaignsPage } from "./pages/AdCampaignsPage";

// Sidebar navigation, grouped by workflow: moderation queue first (the daily
// job), then content management, then business tools. Routes are unchanged.
type NavItem = {
  path: string;
  label: string;
  icon: IconName;
  element: JSX.Element;
};

// Overview landing page — the portal's home. Rendered as a standalone link
// above the grouped sections; `/` is its route.
const DASHBOARD_ITEM: NavItem = {
  path: "/",
  label: "Pulpit",
  icon: "squaresFour",
  element: <DashboardPage />,
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Moderacja",
    items: [
      {
        path: "/reports",
        label: "Zgłoszenia",
        icon: "flag",
        element: <ReportsPage />,
      },
      {
        path: "/moderation",
        label: "Moderacja",
        icon: "shieldCheck",
        element: <ModerationPage />,
      },
      {
        path: "/users",
        label: "Użytkownicy",
        icon: "user",
        element: <UsersPage />,
      },
    ],
  },
  {
    title: "Treści",
    items: [
      {
        path: "/communities",
        label: "Społeczności",
        icon: "usersThree",
        element: <CommunitiesPage />,
      },
      {
        path: "/events",
        label: "Wydarzenia",
        icon: "calendar",
        element: <EventsPage />,
      },
      {
        path: "/safe-places",
        label: "Bezpieczne miejsca",
        icon: "mapPin",
        element: <SafePlacesPage />,
      },
      {
        path: "/resources",
        label: "Materiały",
        icon: "book",
        element: <ResourcesPage />,
      },
    ],
  },
  {
    title: "Rozwój",
    items: [
      {
        path: "/ad-campaigns",
        label: "Kampanie reklamowe",
        icon: "megaphone",
        element: <AdCampaignsPage />,
      },
    ],
  },
];

const ALL_NAV_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap((g) => g.items)];

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

  if (isLoading) {
    return (
      <div className="bq-centered">
        <Icon name="spinner" size={24} className="bq-spin" label="Ładowanie" />
      </div>
    );
  }
  if (!admin) return <LoginScreen onAuthenticated={setAdmin} />;

  return (
    <ConfirmProvider>
      <div className="bq-layout">
        <aside className="bq-sidebar">
          <div className="bq-sidebar-brand">
            <span className="bq-logo-mark">B</span>
            <span>
              <span className="bq-sidebar-brand-name">Blis-Q</span>
              <span className="bq-sidebar-brand-sub">
                Panel administracyjny
              </span>
            </span>
          </div>

          <nav className="bq-nav" aria-label="Nawigacja główna">
            {/* Dashboard is the home route ("/"), so `end` keeps it from
                matching every path as active. */}
            <NavLink to={DASHBOARD_ITEM.path} end className="bq-nav-link">
              <Icon name={DASHBOARD_ITEM.icon} size={17} />
              <span className="bq-nav-label">{DASHBOARD_ITEM.label}</span>
            </NavLink>
            {NAV_GROUPS.map((group) => (
              <div key={group.title} style={{ display: "contents" }}>
                <span className="bq-nav-section">{group.title}</span>
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="bq-nav-link"
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="bq-nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="bq-sidebar-footer">
            <span className="bq-avatar" aria-hidden>
              {admin.displayName.trim().charAt(0).toUpperCase() || "A"}
            </span>
            <span className="bq-sidebar-user">
              <span className="bq-sidebar-user-name">{admin.displayName}</span>
              <span className="bq-sidebar-user-role">Administrator</span>
            </span>
            <button
              type="button"
              className="bq-signout"
              title="Wyloguj"
              aria-label="Wyloguj"
              onClick={() => {
                clearToken();
                setAdmin(null);
              }}
            >
              <Icon name="signOut" size={16} />
            </button>
          </div>
        </aside>

        <main className="bq-main">
          <div className="bq-page">
            <Routes>
              {ALL_NAV_ITEMS.map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={item.element}
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </ConfirmProvider>
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
    <div className="bq-login">
      <form className="bq-login-card" onSubmit={handleSubmit}>
        <div className="bq-login-head">
          <span className="bq-logo-mark" style={{ width: 44, height: 44 }}>
            B
          </span>
          <div>
            <h1 className="bq-login-title">Blis-Q</h1>
            <p className="bq-login-sub">
              Zaloguj się do panelu administracyjnego
            </p>
          </div>
        </div>

        <Field label="E-mail" required>
          <Input
            type="email"
            placeholder="ty@blis-q.app"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Hasło" required>
          <Input
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? "Logowanie…" : "Zaloguj się"}
        </Button>

        <p className="bq-login-foot">
          <Icon name="lock" size={11} label="Połączenie zabezpieczone" /> Dostęp
          wyłącznie dla zespołu Blis-Q
        </p>
      </form>
    </div>
  );
}
