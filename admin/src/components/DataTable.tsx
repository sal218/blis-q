import type { ReactNode } from "react";
import { Skeleton, EmptyState } from "./ui";
import type { IconName } from "./Icon";

// Reusable table for the admin dashboard. Pages supply typed columns + rows;
// this owns the chrome: card container, sticky header, hover rows, skeleton
// loading rows, and an illustrated empty state.

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Optional fixed width (px or CSS size) — e.g. thumbnails, action columns. */
  width?: number | string;
  align?: "left" | "right";
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  emptyLabel: string;
  emptyIcon?: IconName;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
  /** Number of shimmer rows shown while loading. */
  skeletonRows?: number;
};

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  emptyLabel,
  emptyIcon = "magnifyingGlass",
  emptyDescription,
  emptyAction,
  loading = false,
  skeletonRows = 6,
}: Props<T>) {
  if (!loading && rows.length === 0) {
    return (
      <div className="bq-table-wrap">
        <EmptyState
          icon={emptyIcon}
          title={emptyLabel}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="bq-table-wrap">
      <table className="bq-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  width: c.width,
                  textAlign: c.align === "right" ? "right" : undefined,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((c, j) => (
                    <td key={c.key}>
                      <Skeleton width={j === 0 ? "72%" : "56%"} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={keyOf(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        textAlign: c.align === "right" ? "right" : undefined,
                      }}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
