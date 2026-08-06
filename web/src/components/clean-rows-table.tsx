import type { ReactNode } from "react";
import { formatInt } from "@/lib/format";
import type { CleanRow } from "@/lib/types";
import { AutoCell } from "./cells";
import { Column, DataTable } from "./data-table";

const WIDE_COLUMNS = new Set(["title", "summary", "text_for_embedding"]);
const MEDIUM_COLUMNS = new Set([
  "authors",
  "categories",
  "authors_joined",
  "categories_joined",
  "abs_url",
  "pdf_url",
  "comment",
]);

/**
 * Renders a cleaned dataset. Columns come from the clean contract in
 * `pipeline_spec` when it is available, otherwise from the keys actually
 * present in the file — never from a hardcoded list.
 */
export function CleanRowsTable({
  rows,
  contractColumns,
  derivedColumns,
  footer,
}: {
  rows: CleanRow[];
  contractColumns?: string[];
  derivedColumns?: string[];
  footer?: ReactNode;
}) {
  const observed = rows.length > 0 ? Object.keys(rows[0] as object) : [];
  const columnNames =
    contractColumns && contractColumns.length > 0 ? contractColumns : observed;

  const missing = columnNames.filter((name) => observed.length > 0 && !observed.includes(name));
  const extra = observed.filter((name) => !columnNames.includes(name));
  const derived = new Set(derivedColumns ?? []);

  const columns: Column<CleanRow>[] = [...columnNames, ...extra].map((name) => ({
    key: name,
    header: name,
    headerClassName: derived.has(name) ? "text-brand-blue" : undefined,
    cellClassName: WIDE_COLUMNS.has(name)
      ? "min-w-[20rem] max-w-[28rem] text-xs"
      : MEDIUM_COLUMNS.has(name)
        ? "min-w-[12rem] max-w-[20rem] text-xs"
        : "whitespace-nowrap text-xs",
    render: (row) => (
      <AutoCell value={(row as unknown as Record<string, unknown>)[name]} />
    ),
  }));

  return (
    <div className="flex flex-col gap-3">
      {(missing.length > 0 || extra.length > 0) && rows.length > 0 ? (
        <div className="rounded-md border border-brand-red-200 bg-brand-red-50 px-3 py-2 text-xs leading-relaxed text-brand-red-700">
          Dataset lệch contract:
          {missing.length > 0 ? (
            <>
              {" "}
              thiếu cột <span className="font-mono">{missing.join(", ")}</span>.
            </>
          ) : null}
          {extra.length > 0 ? (
            <>
              {" "}
              có cột ngoài contract <span className="font-mono">{extra.join(", ")}</span>.
            </>
          ) : null}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row, index) => `${row?.paper_id ?? "row"}-${index}`}
        maxHeightClass="max-h-[36rem]"
        footer={footer ?? `${formatInt(rows.length)} dòng đọc từ file.`}
      />
    </div>
  );
}
