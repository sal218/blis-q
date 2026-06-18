import type { CSSProperties, ReactNode } from "react";

// Minimal reusable table for the admin dashboard. Pages supply typed columns +
// rows; this owns the chrome (header, zebra rows, empty state) so pages stay
// lean. Styling matches the dashboard's light content area.

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  emptyLabel: string;
};

export function DataTable<T>({ columns, rows, keyOf, emptyLabel }: Props<T>) {
  if (rows.length === 0) {
    return <p style={styles.empty}>{emptyLabel}</p>;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={styles.th}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={keyOf(row)}>
            {columns.map((c) => (
              <td key={c.key} style={styles.td}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles: Record<string, CSSProperties> = {
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6B7280",
    background: "#F9FAFB",
    borderBottom: "1px solid #E5E7EB",
  },
  td: {
    padding: "12px 16px",
    fontSize: 14,
    color: "#111827",
    borderBottom: "1px solid #F3F4F6",
    verticalAlign: "top",
  },
  empty: { color: "#6B7280", fontSize: 14 },
};
