import type { ReactNode } from "react";
import { ScrollShell } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  /** Tailwind classes for the cell, e.g. widths or `whitespace-nowrap`. */
  cellClassName?: string;
  headerClassName?: string;
}

/**
 * Table shell used everywhere rows come from a real artifact.
 * The table scrolls horizontally inside its own container.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  footer,
  maxHeightClass,
  emptyMessage = "Artifact tồn tại nhưng không có dòng nào.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  footer?: ReactNode;
  /** e.g. `max-h-[32rem]` to make long tables scroll vertically too. */
  maxHeightClass?: string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-ink-faint">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ScrollShell>
        <div
          className={
            maxHeightClass
              ? `scroll-shell ${maxHeightClass} overflow-y-auto rounded-md border border-line`
              : "rounded-md border border-line"
          }
        >
          <table className="w-full min-w-max border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-brand-blue-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-blue-700 ${column.headerClassName ?? ""}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  className="border-b border-line-soft last:border-b-0 odd:bg-surface even:bg-canvas/60"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2 align-top text-ink ${column.cellClassName ?? ""}`}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollShell>
      {footer ? <div className="text-xs text-ink-faint">{footer}</div> : null}
    </div>
  );
}

/** Truncating cell for long free text; full value stays in the title attribute. */
export function Clamp({ text, lines = 3 }: { text: string; lines?: number }) {
  if (!text) {
    return <span className="text-ink-faint">—</span>;
  }
  return (
    <span
      title={text}
      className="block overflow-hidden text-ink"
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
      }}
    >
      {text}
    </span>
  );
}
