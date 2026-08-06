"use client";

import { useCallback } from "react";
import { getCleanDataset, getPipelineSpec, getRawRecords } from "@/lib/api";
import { formatInt } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import type { CleanContract } from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { CleanRowsTable } from "@/components/clean-rows-table";
import {
  Badge,
  Mono,
  Note,
  PageHeading,
  PageShell,
  Panel,
  StatTile,
} from "@/components/ui";

export default function CleanPage() {
  const spec = useArtifact(getPipelineSpec);
  const rawRecords = useArtifact(getRawRecords);
  const cleanRows = useArtifact(
    useCallback(() => getCleanDataset("clean"), []),
  );

  const rowsIn = rawRecords.status === "ok" ? rawRecords.data.length : null;
  const rowsOut = cleanRows.status === "ok" ? cleanRows.data.length : null;

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 2 · clean"
        title="Data được làm sạch như nào"
        lede="Contract 16 cột, luật loại dòng, luật dedupe và template text_for_embedding — tất cả đọc từ pipeline_spec.clean_contract. Dataset thật hiện bên dưới khi cleaning đã chạy."
      />

      <Panel
        title="Clean contract"
        subtitle={
          <>
            Từ <Mono>pipeline_spec.clean_contract</Mono>. Cột được đánh dấu{" "}
            <Badge tone="blue">derived</Badge> là do bước cleaning sinh ra, phần còn lại
            đi thẳng từ <Mono>PaperRecord</Mono>.
          </>
        }
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <ContractView contract={data.clean_contract} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Luật loại dòng & dedupe"
        subtitle="Một dòng chỉ đi tiếp nếu vượt qua toàn bộ ngưỡng độ dài, parse được ngày, và không trùng với dòng đã giữ."
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <RejectRules contract={data.clean_contract} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Template text_for_embedding"
        subtitle="Chuỗi thực sự được embed. Nếu một trường trong template bị rỗng hoặc bị làm hỏng, vector embedding lệch theo — đó là cầu nối giữa data quality và RAG quality."
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <EmbeddingTemplate contract={data.clean_contract} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Dataset đã làm sạch"
        subtitle={
          <>
            Từ <Mono>data/clean/papers_clean.json</Mono>.
          </>
        }
        aside={
          <div className="flex flex-wrap items-center gap-1.5">
            {rowsIn !== null ? <Badge tone="neutral">in {formatInt(rowsIn)}</Badge> : null}
            {rowsOut !== null ? <Badge tone="blue">out {formatInt(rowsOut)}</Badge> : null}
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <RowCounts rowsIn={rowsIn} rowsOut={rowsOut} />
          <ArtifactBoundary state={cleanRows} label="papers_clean.json">
            {(rows) => (
              <CleanRowsTable
                rows={rows}
                contractColumns={
                  spec.status === "ok" ? spec.data.clean_contract.columns : undefined
                }
                derivedColumns={
                  spec.status === "ok"
                    ? spec.data.clean_contract.derived_columns
                    : undefined
                }
              />
            )}
          </ArtifactBoundary>
        </div>
      </Panel>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function ContractView({ contract }: { contract: CleanContract }) {
  const derived = new Set(contract.derived_columns);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Tổng số cột" value={contract.columns.length} tone="blue" />
        <StatTile label="Cột derived" value={contract.derived_columns.length} />
        <StatTile
          label="Cột từ source"
          value={contract.columns.length - contract.derived_columns.length}
        />
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {contract.columns.map((column, index) => (
          <li
            key={column}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
              derived.has(column)
                ? "border-brand-blue-200 bg-brand-blue-50"
                : "border-line bg-canvas"
            }`}
          >
            <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-faint">
              {index + 1}
            </span>
            <span className="break-anywhere min-w-0 font-mono text-[13px] text-ink">
              {column}
            </span>
            <span className="ml-auto shrink-0">
              <Badge tone={derived.has(column) ? "blue" : "muted"}>
                {derived.has(column) ? "derived" : "source"}
              </Badge>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RejectRules({ contract }: { contract: CleanContract }) {
  const dedupe = contract.reject_reasons.filter((reason) =>
    reason.key.startsWith("duplicate_"),
  );
  const validation = contract.reject_reasons.filter(
    (reason) => !reason.key.startsWith("duplicate_"),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="min_title_chars"
          value={contract.min_title_chars}
          hint="title ngắn hơn ngưỡng bị loại"
        />
        <StatTile
          label="min_summary_chars"
          value={contract.min_summary_chars}
          hint="summary ngắn hơn ngưỡng bị loại"
        />
        <StatTile
          label="reject_reasons"
          value={contract.reject_reasons.length}
          hint="số lý do loại dòng được khai báo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReasonGroup
          title="Validation"
          description="Kiểm tra trên từng dòng độc lập."
          reasons={validation}
        />
        <ReasonGroup
          title="Dedupe"
          description="Kiểm tra dòng hiện tại với các dòng đã được giữ trước đó; dòng đầu tiên thắng."
          reasons={dedupe}
          tone="alert"
        />
      </div>
    </div>
  );
}

function ReasonGroup({
  title,
  description,
  reasons,
  tone = "default",
}: {
  title: string;
  description: string;
  reasons: { key: string; label: string }[];
  tone?: "default" | "alert";
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <Badge tone={tone === "alert" ? "red" : "blue"}>{reasons.length}</Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{description}</p>
      {reasons.length === 0 ? (
        <p className="mt-3 text-xs text-ink-faint">
          Không có lý do nào thuộc nhóm này trong spec.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {reasons.map((reason) => (
            <li
              key={reason.key}
              className="flex flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2"
            >
              <span className="break-anywhere font-mono text-[12px] text-brand-blue">
                {reason.key}
              </span>
              <span className="text-[13px] text-ink-soft">{reason.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmbeddingTemplate({ contract }: { contract: CleanContract }) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {contract.text_for_embedding_template.map((field, index) => (
          <li key={field} className="flex items-center gap-1.5">
            <span className="rounded-md border border-brand-blue-200 bg-brand-blue-50 px-2.5 py-1 font-mono text-[13px] text-brand-blue-700">
              {field}
            </span>
            {index < contract.text_for_embedding_template.length - 1 ? (
              <span aria-hidden className="text-line">
                +
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <Note>
        {contract.text_for_embedding_template.length} trường được ghép lại thành cột{" "}
        <Mono>text_for_embedding</Mono>, và chỉ cột đó được đưa vào model embedding.
      </Note>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RowCounts({
  rowsIn,
  rowsOut,
}: {
  rowsIn: number | null;
  rowsOut: number | null;
}) {
  if (rowsIn === null && rowsOut === null) {
    return (
      <p className="text-xs text-ink-faint">
        Row-count in/out sẽ hiện khi cả{" "}
        <span className="font-mono">data/raw/crossref_records.json</span> và{" "}
        <span className="font-mono">data/clean/papers_clean.json</span> tồn tại.
      </p>
    );
  }

  const dropped = rowsIn !== null && rowsOut !== null ? rowsIn - rowsOut : null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile
        label="Rows in (raw)"
        value={rowsIn === null ? "—" : formatInt(rowsIn)}
        hint={rowsIn === null ? "crossref_records.json chưa có" : "crossref_records.json"}
      />
      <StatTile
        label="Rows out (clean)"
        value={rowsOut === null ? "—" : formatInt(rowsOut)}
        hint={rowsOut === null ? "papers_clean.json chưa có" : "papers_clean.json"}
        tone={rowsOut === null ? "neutral" : "blue"}
      />
      <StatTile
        label="Bị loại"
        value={dropped === null ? "—" : formatInt(dropped)}
        hint={dropped === null ? "cần cả hai file" : "in − out"}
        tone={dropped !== null && dropped > 0 ? "red" : "neutral"}
      />
    </div>
  );
}
