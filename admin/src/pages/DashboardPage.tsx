import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminFetch, type AdminUser } from "../lib/api";
import type { OffsetPage } from "../lib/types";
import { Icon, type IconName } from "../components/Icon";
import { Badge, PageHeader, Skeleton } from "../components/ui";

// Overview landing page. Moderation-first: the pending-reports load is the hero
// callout, then platform counts, quick actions, and placeholders for the
// activity feed (needs the audit_log endpoint, P-27) + analytics (no time-series
// data yet). Every number comes from the `total` of an existing admin list
// endpoint (pageSize=1 → minimal payload) — no new backend. Counts load
// independently so one failure never blanks the page.

type CountState = number | null | "error";

// One count = the `total` from a list endpoint. pageSize=1 keeps the body tiny.
async function fetchCount(path: string): Promise<CountState> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const data = await adminFetch<OffsetPage<unknown>>(
      "GET",
      `${path}${sep}pageSize=1`,
    );
    return data.total;
  } catch {
    return "error";
  }
}

function formatCount(v: CountState): string {
  if (v === null) return "…";
  if (v === "error") return "—";
  return v.toLocaleString("pl-PL");
}

type StatTile = {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  value: CountState;
  amber?: boolean;
  sub?: { text: string; tone: "danger" | "muted" };
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<CountState>(null);
  const [reviewing, setReviewing] = useState<CountState>(null);
  const [users, setUsers] = useState<CountState>(null);
  const [banned, setBanned] = useState<CountState>(null);
  const [communities, setCommunities] = useState<CountState>(null);
  const [safePlaces, setSafePlaces] = useState<CountState>(null);

  useEffect(() => {
    let alive = true;
    // The admin identity for the greeting (already cached server-side).
    adminFetch<AdminUser>("GET", "/api/admin/me")
      .then((a) => alive && setAdmin(a))
      .catch(() => {});
    // Fire every count in parallel; each commits independently.
    const jobs: [string, (v: CountState) => void][] = [
      ["/api/admin/reports?status=pending", setPending],
      ["/api/admin/reports?status=reviewing", setReviewing],
      ["/api/admin/users", setUsers],
      ["/api/admin/users?status=banned", setBanned],
      ["/api/admin/communities", setCommunities],
      ["/api/admin/safe-places", setSafePlaces],
    ];
    for (const [path, set] of jobs) {
      fetchCount(path).then((v) => alive && set(v));
    }
    return () => {
      alive = false;
    };
  }, []);

  const greetingName = admin?.displayName?.trim() || "";
  const pendingNum = typeof pending === "number" ? pending : 0;
  const hasPending = typeof pending === "number" && pending > 0;

  const tiles: StatTile[] = [
    {
      key: "pending",
      label: "Zgłoszenia oczekujące",
      icon: "flag",
      to: "/reports",
      value: pending,
      amber: hasPending,
      sub:
        typeof reviewing === "number" && reviewing > 0
          ? { text: `${reviewing} w trakcie`, tone: "muted" }
          : undefined,
    },
    {
      key: "users",
      label: "Użytkownicy",
      icon: "user",
      to: "/users",
      value: users,
      sub:
        typeof banned === "number" && banned > 0
          ? { text: `${banned} zablokowanych`, tone: "danger" }
          : undefined,
    },
    {
      key: "communities",
      label: "Społeczności",
      icon: "usersThree",
      to: "/communities",
      value: communities,
    },
    {
      key: "safe-places",
      label: "Bezpieczne miejsca",
      icon: "mapPin",
      to: "/safe-places",
      value: safePlaces,
    },
  ];

  const quickActions: {
    title: string;
    desc: string;
    icon: IconName;
    to: string;
  }[] = [
    {
      title: "Przejrzyj zgłoszenia",
      desc: "Otwórz kolejkę moderacji",
      icon: "flag",
      to: "/reports",
    },
    {
      title: "Dodaj bezpieczne miejsce",
      desc: "Nowe zweryfikowane miejsce",
      icon: "mapPin",
      to: "/safe-places",
    },
    {
      title: "Nowa społeczność",
      desc: "Załóż grupę społeczności",
      icon: "usersThree",
      to: "/communities",
    },
    {
      title: "Zarządzaj użytkownikami",
      desc: "Szukaj, blokuj, odblokowuj",
      icon: "user",
      to: "/users",
    },
  ];

  return (
    <section>
      <PageHeader
        title="Pulpit"
        description="Przegląd platformy Blis-Q — stan moderacji i szybkie akcje."
      />

      {/* Hero: greeting + the one number that matters (open moderation load). */}
      <div className="bq-hero">
        <div className="bq-hero-inner">
          <div>
            <h2 className="bq-hero-greeting">
              {greetingName ? `Witaj, ${greetingName}` : "Witaj"}
            </h2>
            <p className="bq-hero-sub">
              {hasPending
                ? "Masz zgłoszenia oczekujące na przegląd. Zacznij od kolejki moderacji."
                : "Wszystko pod kontrolą — brak zgłoszeń oczekujących na przegląd."}
            </p>
          </div>
          <button
            type="button"
            className="bq-hero-callout"
            onClick={() => navigate("/reports")}
            style={{ cursor: "pointer" }}
            aria-label="Przejdź do zgłoszeń oczekujących"
          >
            <span className="bq-hero-callout-num">{formatCount(pending)}</span>
            <span className="bq-hero-callout-label">
              {pendingNum === 1
                ? "zgłoszenie oczekuje"
                : "zgłoszeń oczekuje na przegląd"}
            </span>
            <Icon name="caretRight" size={18} />
          </button>
        </div>
      </div>

      {/* Platform counts — each tile links to its section. */}
      <div className="bq-stat-grid">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className="bq-stat"
            onClick={() => navigate(t.to)}
            aria-label={`${t.label}: ${formatCount(t.value)}`}
          >
            <div className="bq-stat-top">
              <span className={`bq-stat-icon${t.amber ? " amber" : ""}`}>
                <Icon name={t.icon} size={18} />
              </span>
              <Icon
                name="caretRight"
                size={15}
                className="bq-quick-action-arrow"
              />
            </div>
            <div className="bq-stat-value">
              {t.value === null ? (
                <Skeleton width={56} height={26} />
              ) : (
                formatCount(t.value)
              )}
            </div>
            <div className="bq-stat-label">{t.label}</div>
            {t.sub ? (
              <div
                className="bq-stat-sub"
                style={{
                  color:
                    t.sub.tone === "danger"
                      ? "var(--danger)"
                      : "var(--gray-500)",
                }}
              >
                {t.sub.text}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {/* Quick actions + a placeholder for the (not-yet-built) activity feed. */}
      <div className="bq-dash-cols">
        <div className="bq-card bq-card-pad">
          <h3 className="bq-card-title">Ostatnia aktywność</h3>
          <p className="bq-card-sub">
            Dziennik działań moderacyjnych — kto, co i kiedy.
          </p>
          <div className="bq-soon-panel">
            <span className="bq-empty-icon">
              <Icon name="clockCounter" size={20} />
            </span>
            <p className="bq-empty-title">Wkrótce</p>
            <p className="bq-empty-desc">
              Historia działań pojawi się tutaj, gdy udostępnimy dziennik
              audytu.
            </p>
          </div>
        </div>

        <div className="bq-card bq-card-pad">
          <h3 className="bq-card-title">Szybkie akcje</h3>
          <p className="bq-card-sub">Najczęstsze zadania w jednym miejscu.</p>
          <div className="bq-quick-actions">
            {quickActions.map((a) => (
              <button
                key={a.to + a.title}
                type="button"
                className="bq-quick-action"
                onClick={() => navigate(a.to)}
              >
                <span className="bq-quick-action-icon">
                  <Icon name={a.icon} size={16} />
                </span>
                <span className="bq-quick-action-body">
                  <span className="bq-quick-action-title">{a.title}</span>
                  <span className="bq-quick-action-desc">{a.desc}</span>
                </span>
                <Icon
                  name="caretRight"
                  size={15}
                  className="bq-quick-action-arrow"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics slot — reserved for when time-series data exists. */}
      <div className="bq-card bq-card-pad" style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h3 className="bq-card-title">Statystyki i trendy</h3>
            <p className="bq-card-sub" style={{ marginBottom: 0 }}>
              Wykresy rejestracji, zgłoszeń i aktywności w czasie.
            </p>
          </div>
          <Badge tone="neutral">Wkrótce</Badge>
        </div>
      </div>
    </section>
  );
}
