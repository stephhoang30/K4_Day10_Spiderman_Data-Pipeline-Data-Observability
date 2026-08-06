"use client";

import { getPipelineSpec, getRawRecords, getRawResponse } from "@/lib/api";
import { formatInt } from "@/lib/format";
import { useArtifact } from "@/lib/use-artifact";
import type { PaperRecord, PipelineSpec } from "@/lib/types";
import { ArtifactBoundary } from "@/components/artifact-state";
import { ArrayCell, LinkCell } from "@/components/cells";
import { Clamp, Column, DataTable } from "@/components/data-table";
import {
  Badge,
  Collapsible,
  KeyValueList,
  Mono,
  Note,
  PageHeading,
  PageShell,
  Panel,
  StatTile,
} from "@/components/ui";

const MAX_RAW_CHARS = 100_000;

export default function CrawlPage() {
  const spec = useArtifact(getPipelineSpec);
  const records = useArtifact(getRawRecords);
  const rawResponse = useArtifact(getRawResponse);

  return (
    <PageShell>
      <PageHeading
        eyebrow="Stage 1 · crawl"
        title="Data được lấy về như nào"
        lede="Nguồn dữ liệu, câu query và bộ lọc đều lấy từ pipeline_spec.source. Bảng bên dưới chỉ hiển thị khi crawl đã thực sự ghi ra file raw."
      />

      <Panel
        title="Cấu hình nguồn"
        subtitle={
          <>
            Từ <Mono>pipeline_spec.source</Mono> — chính là hằng số mà{" "}
            <Mono>src/core/config.py</Mono> dùng khi gọi API.
          </>
        }
      >
        <ArtifactBoundary state={spec} label="pipeline_spec.json">
          {(data) => <SourceConfig spec={data} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Records đã fetch"
        subtitle={
          <>
            Parse từ raw response thành <Mono>PaperRecord</Mono> và ghi ra{" "}
            <Mono>data/raw/crossref_records.json</Mono>.
          </>
        }
        aside={
          records.status === "ok" ? (
            <Badge tone="blue">{formatInt(records.data.length)} records</Badge>
          ) : null
        }
      >
        <ArtifactBoundary state={records} label="crossref_records.json">
          {(rows) => <RecordsTable rows={rows} />}
        </ArtifactBoundary>
      </Panel>

      <Panel
        title="Raw API response"
        subtitle="Body nguyên trạng do Crossref trả về, giữ lại để truy vết khi số liệu downstream trông lạ."
      >
        <Collapsible summary="Xem raw response" hint="data/raw/crossref_response.json">
          <ArtifactBoundary state={rawResponse} label="crossref_response.json">
            {(data) => <RawJson data={data} />}
          </ArtifactBoundary>
        </Collapsible>
      </Panel>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function SourceConfig({ spec }: { spec: PipelineSpec }) {
  const { source } = spec;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="API" value={source.api} tone="blue" />
        <StatTile
          label="max_results"
          value={source.max_results}
          hint="trần số record mỗi lần crawl"
        />
        <StatTile
          label="freshness threshold"
          value={spec.freshness.threshold_days}
          hint="ngày — cũng chính là cửa sổ from-pub-date"
        />
      </div>

      <KeyValueList
        items={[
          {
            label: "Endpoint",
            value: (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="break-anywhere font-mono text-[13px] text-brand-blue underline underline-offset-2"
              >
                {source.url}
              </a>
            ),
          },
          {
            label: "Query",
            value: <Mono>{source.query}</Mono>,
            hint: "chuỗi tìm kiếm full-text gửi lên Crossref",
          },
          {
            label: "Crossref filter",
            value: <Mono>{source.filter}</Mono>,
            hint: "giới hạn ngày xuất bản và bắt buộc có abstract",
          },
        ]}
      />

      <Note>
        Filter <Mono>from-pub-date</Mono> được tính lại mỗi lần chạy dựa trên ngưỡng
        freshness, nên giá trị hiển thị ở đây đúng với thời điểm spec được export chứ
        không phải hằng số cố định.
      </Note>
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
      <p className="text-xs text-ink-faint">
        {truncated
          ? `Hiển thị ${formatInt(MAX_RAW_CHARS)} / ${formatInt(text.length)} ký tự đầu tiên.`
          : `${formatInt(text.length)} ký tự.`}
      </p>
      <pre className="scroll-shell max-h-[32rem] overflow-auto rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
        <code>{shown}</code>
      </pre>
    </div>
  );
}
