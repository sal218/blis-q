import { Icon, type IconName } from "./Icon";
import { Badge, EmptyState, PageHeader } from "./ui";

// Scaffold for sections whose backend hasn't landed yet (Events oversight,
// moderation history, ad campaigns). Instead of a bare "coming soon" line it
// shows the page frame + the planned modules, so the portal's information
// architecture is visible today and each module can be wired in later without
// a layout rethink. Purely presentational — no functionality.

export type PlannedModule = {
  icon: IconName;
  title: string;
  description: string;
};

export function PlannedPage({
  title,
  description,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  modules,
}: {
  title: string;
  description: string;
  emptyIcon: IconName;
  emptyTitle: string;
  emptyDescription: string;
  modules: PlannedModule[];
}) {
  return (
    <section>
      <PageHeader title={title} description={description} />

      <div className="bq-card" style={{ marginBottom: 20 }}>
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {modules.map((m) => (
          <div
            key={m.title}
            className="bq-card bq-card-pad"
            style={{ opacity: 0.72 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                className="bq-empty-icon"
                style={{ width: 34, height: 34, marginBottom: 0 }}
              >
                <Icon name={m.icon} size={17} />
              </span>
              <Badge tone="neutral">Wkrótce</Badge>
            </div>
            <h3 className="bq-card-title">{m.title}</h3>
            <p
              className="bq-card-sub"
              style={{ marginBottom: 0, marginTop: 4 }}
            >
              {m.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
