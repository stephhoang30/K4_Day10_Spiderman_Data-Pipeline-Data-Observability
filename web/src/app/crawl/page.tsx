"use client";

import { getPipelineSpec, getRawRecords, getRawResponse } from "@/lib/api";
import { monthlyCounts } from "@/lib/derive";
import { formatInt } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import type { PaperRecord, PipelineSpec } from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { ArrayCell, LinkCell } from "@/components/cells";
import { CrawlDiagram, MonthlyColumns } from "@/components/diagrams";
import { Clamp, Column, DataTable } from "@/components/data-table";
import {
  Collapsible,
  DetailDrawer,
  Mono,
  PageHeading,
  PageShell,
  Section,
  StatTile,
} from "@/components/ui";

const MAX_RAW_CHARS = 100_000;

export default function CrawlPage() {
  const spec = useArtifact(getPipelineSpec);
  const records = useArtifact(getRawRecords);
  const rawResponse = useArtifact(getRawResponse);

  const recordCount = records.status === "ok" ? records.data.length : null;
  const maxResults = spec.status === "ok" ? spec.data.source.max_results : null;
  const apiName = spec.status === "ok" ? spec.data.source.api : "Nguồn dữ liệu";

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 1 · crawl"
        title="Dữ liệu vào pipeline từ đâu"
        lede="Một lần gọi API công khai, giữ lại nguyên văn response, rồi parse thành record có kiểu."
      />

      <Section
        title="Đường đi của một lần crawl"
        subtitle="Mỗi ô vuông bên phải là một record thật trong crossref_records.json."
      >
        <CrawlDiagram
          apiName={apiName}
          maxResults={maxResults}
          recordCount={recordCount}
        />
      </Section>

      <Section
        title="Truy vấn gửi lên"
        subtitle={
          <>
            Từ <Mono>pipeline_spec.source</Mono> — chính là hằng số{" "}
            <Mono>src/core/config.py</Mono> dùng khi gọi API.
          </>
        }
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <SourceConfig spec={data} recordCount={recordCount} />}
        </ArtifactBoundary>
      </Section>

      <Section
        title="Các paper lấy về nằm ở tháng nào"
        subtitle="Đếm trực tiếp từ trường published của từng record. Đây là phân bố mà freshness check sẽ soi ở stage observe."
      >
        <ArtifactBoundary state={records} label="crossref_records.json">
          {(rows) => (
            <MonthlyColumns
              data={monthlyCounts(rows)}
              caption={`${formatInt(rows.length)} record, nhóm theo tháng của trường published.`}
            />
          )}
        </ArtifactBoundary>
      </Section>

      <DetailDrawer>
        <Collapsible summary="Bảng record đã fetch" hint="data/raw/crossref_records.json">
          <ArtifactBoundary state={records} label="crossref_records.json">
            {(rows) => <RecordsTable rows={rows} />}
          </ArtifactBoundary>
        </Collapsible>

        <Collapsible summary="Raw API response" hint="data/raw/crossref_response.json">
          <ArtifactBoundary state={rawResponse} label="crossref_response.json">
            {(data) => <RawJson data={data} />}
          </ArtifactBoundary>
        </Collapsible>
      </DetailDrawer>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function SourceConfig({
  spec,
  recordCount,
}: {
  spec: PipelineSpec;
  recordCount: number | null;
}) {
  const { source } = spec;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="record lấy về"
          value={recordCount === null ? "—" : formatInt(recordCount)}
          tone="blue"
          size="lg"
          hint="đếm từ file raw"
        />
        <StatTile label="max_results" value={source.max_results} hint="trần mỗi lần crawl" />
        <StatTile
          label="freshness threshold"
          value={spec.freshness.threshold_days}
          hint="ngày — cũng là cửa sổ from-pub-date"
        />
        <StatTile label="top_k" value={spec.retrieval.top_k} hint="agent lấy về mỗi câu" />
      </div>

      <div className="flex flex-col gap-3">
        <QueryLine label="endpoint">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="break-anywhere font-mono text-lg text-brand-blue underline underline-offset-4"
          >
            {source.url}
          </a>
        </QueryLine>
        <QueryLine label="query">
          <span className="break-anywhere font-mono text-lg text-ink">{source.query}</span>
        </QueryLine>
        <QueryLine label="filter">
          <span className="break-anywhere font-mono text-lg text-ink">{source.filter}</span>
        </QueryLine>
      </div>

      <p className="text-base leading-relaxed text-ink-soft">
        <Mono>from-pub-date</Mono> được tính lại mỗi lần chạy theo ngưỡng freshness, nên giá
        trị hiển thị đúng với thời điểm spec được export chứ không phải hằng số cố định.
      </p>
    </div>
  );
}

function QueryLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-line bg-canvas px-4 py-3">
      <span className="w-24 shrink-0 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RecordsTable({ rows }: { rows: PaperRecord[] }) {
  const columns: Column<PaperRecord>[] = [
    {
      key: "paper_id",
      header: "paper_id",
      cellClassName: "whitespace-nowrap font-mono text-xs",
      render: (row) => row.paper_id || "—",
    },
    {
      key: "title",
      header: "title",
      cellClassName: "min-w-[18rem] max-w-[26rem]",
      render: (row) => <Clamp text={row.title} lines={2} />,
    },
    {
      key: "primary_category",
      header: "primary_category",
      cellClassName: "whitespace-nowrap text-xs",
      render: (row) => row.primary_category || "—",
    },
    {
      key: "published",
      header: "published",
      cellClassName: "whitespace-nowrap font-mono text-xs",
      render: (row) => row.published || "—",
    },
    {
      key: "updated",
      header: "updated",
      cellClassName: "whitespace-nowrap font-mono text-xs",
      render: (row) => row.updated || "—",
    },
    {
      key: "authors",
      header: "authors",
      cellClassName: "min-w-[14rem] max-w-[20rem] text-xs",
      render: (row) => <ArrayCell values={row.authors} />,
    },
    {
      key: "categories",
      header: "categories",
      cellClassName: "min-w-[10rem] max-w-[16rem] text-xs",
      render: (row) => <ArrayCell values={row.categories} />,
    },
    {
      key: "summary",
      header: "summary",
      cellClassName: "min-w-[22rem] max-w-[30rem] text-xs",
      render: (row) => <Clamp text={row.summary} lines={3} />,
    },
    {
      key: "abs_url",
      header: "abs_url",
      cellClassName: "max-w-[16rem]",
      render: (row) => <LinkCell href={row.abs_url} />,
    },
    {
      key: "pdf_url",
      header: "pdf_url",
      cellClassName: "max-w-[16rem]",
      render: (row) => <LinkCell href={row.pdf_url} />,
    },
    {
      key: "comment",
      header: "comment",
      cellClassName: "min-w-[10rem] max-w-[16rem] text-xs",
      render: (row) => <Clamp text={row.comment} lines={2} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row, index) => `${row.paper_id || "row"}-${index}`}
      maxHeightClass="max-h-[36rem]"
      footer={`${formatInt(rows.length)} record đọc từ file.`}
    />
  );
}

/* -------------------------------------------------------------------------- */

function RawJson({ data }: { data: unknown }) {
  const text = JSON.stringify(data, null, 2) ?? "";
  const truncated = text.length > MAX_RAW_CHARS;
  const shown = truncated ? text.slice(0, MAX_RAW_CHARS) : text;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-faint">
        {truncated
          ? `Hiển thị ${formatInt(MAX_RAW_CHARS)} / ${formatInt(text.length)} ký tự đầu tiên.`
          : `${formatInt(text.length)} ký tự.`}
      </p>
      <pre className="scroll-shell max-h-[32rem] overflow-auto rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs leading-relaxed text-ink">
        <code>{shown}</code>
      </pre>
    </div>
  );
}
