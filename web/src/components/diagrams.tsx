import type { ReactNode } from "react";
import type { ContractGraph, Detectability, ImpactGroup } from "@/lib/derive";
import { formatInt, formatMetric } from "@/lib/format";
import type { CorruptionAction, RunState } from "@/lib/types";

/**
 * Hand-drawn inline SVG. No chart or diagram library, no external asset.
 *
 * Every label and number that appears here is passed in from an artifact the
 * page already fetched — these components decide geometry, never content.
 *
 * Wide drawings scale with `viewBox` and carry a `minWidth`, so on a narrow
 * screen they scroll inside their own container instead of widening the body.
 */

const INK = "var(--color-ink)";
const INK_SOFT = "var(--color-ink-soft)";
const INK_FAINT = "var(--color-ink-faint)";
const LINE = "var(--color-line)";
const SURFACE = "var(--color-surface)";
const CANVAS = "var(--color-canvas)";
const BLUE = "var(--color-brand-blue-600)";
const BLUE_DEEP = "var(--color-brand-blue)";
const BLUE_SOFT = "var(--color-brand-blue-50)";
const RED = "var(--color-brand-red)";
const RED_SOFT = "var(--color-brand-red-50)";
const RED_LINE = "var(--color-brand-red-200)";
const GREEN = "var(--color-ok)";
const GREEN_SOFT = "var(--color-ok-50)";
const GREEN_LINE = "var(--color-ok-200)";

function Frame({
  viewBox,
  minWidth,
  label,
  caption,
  children,
}: {
  viewBox: string;
  minWidth: number;
  label: string;
  /** explanatory line, rendered as HTML under the drawing so it can wrap */
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="scroll-shell overflow-x-auto">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={label}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", minWidth, height: "auto", display: "block" }}
        >
          {children}
        </svg>
      </div>
      {caption ? (
        <figcaption className="text-base leading-relaxed text-ink-faint">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ========================================================================== */
/* 1 · What corruption does to a single record                                */
/* ========================================================================== */

type RecordVariant =
  | "intact"
  | "dropped"
  | "blank_summary"
  | "clipped_title"
  | "stale_date"
  | "duplicated"
  | "noisy_summary";

/**
 * Which schematic mutation illustrates which corruption type. Keys are the
 * `type` values the corruption log writes; an unknown type falls back to the
 * intact card so a new corruption kind still renders.
 */
const VARIANT_BY_TYPE: Record<string, RecordVariant> = {
  drop_latest_records: "dropped",
  blank_summary: "blank_summary",
  truncate_title: "clipped_title",
  stale_published: "stale_date",
  duplicate_rows: "duplicated",
  inject_noise: "noisy_summary",
};

/** One schematic paper record: id chip, title bar, date chip, summary lines. */
function RecordCard({
  x,
  y,
  variant,
  faded = false,
}: {
  x: number;
  y: number;
  variant: RecordVariant;
  faded?: boolean;
}) {
  const opacity = faded ? 0.35 : 1;
  const clipped = variant === "clipped_title";
  const titleWidth = clipped ? 62 : 210;
  const summaryEmpty = variant === "blank_summary";
  const noisy = variant === "noisy_summary";
  const stale = variant === "stale_date";
  // only the field this corruption actually touches turns red
  const titleFill = clipped ? RED : BLUE;

  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect
        width={260}
        height={132}
        rx={10}
        fill={SURFACE}
        stroke={variant === "intact" ? LINE : RED_LINE}
        strokeWidth={2}
      />

      {/* paper_id */}
      <text x={14} y={22} fontSize={11} fill={INK_FAINT} fontFamily="var(--font-mono)">
        paper_id
      </text>
      <rect x={14} y={28} width={104} height={9} rx={4.5} fill={LINE} />

      {/* title */}
      <text x={14} y={56} fontSize={11} fill={INK_FAINT} fontFamily="var(--font-mono)">
        title
      </text>
      <rect x={14} y={62} width={titleWidth} height={12} rx={6} fill={titleFill} />
      {clipped ? (
        <>
          <rect x={80} y={60} width={148} height={16} rx={6} fill={CANVAS} stroke={RED_LINE} strokeDasharray="4 4" />
          <line x1={78} y1={54} x2={78} y2={82} stroke={RED} strokeWidth={2} strokeDasharray="4 3" />
          <text x={90} y={72} fontSize={11} fill={RED} fontFamily="var(--font-mono)">
            bị cắt
          </text>
        </>
      ) : null}

      {/* published */}
      <text x={14} y={94} fontSize={11} fill={INK_FAINT} fontFamily="var(--font-mono)">
        published
      </text>
      <rect x={72} y={85} width={62} height={12} rx={6} fill={stale ? RED : LINE} />
      {stale ? (
        <>
          <line x1={68} y1={91} x2={140} y2={91} stroke={RED} strokeWidth={2} />
          <path d="M 68 91 l 9 -5 l 0 10 z" fill={RED} />
          <text x={146} y={95} fontSize={11} fill={RED} fontFamily="var(--font-mono)">
            lùi lại
          </text>
        </>
      ) : null}

      {/* summary */}
      <text x={14} y={116} fontSize={11} fill={INK_FAINT} fontFamily="var(--font-mono)">
        summary
      </text>
      {summaryEmpty ? (
        <rect
          x={72}
          y={107}
          width={172}
          height={12}
          rx={6}
          fill="none"
          stroke={RED}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      ) : noisy ? (
        <>
          <rect x={72} y={107} width={172} height={12} rx={6} fill={BLUE} />
          <rect x={112} y={104} width={46} height={18} rx={4} fill={RED} />
          <rect x={198} y={104} width={30} height={18} rx={4} fill={RED} />
          <text x={116} y={118} fontSize={12} fill={SURFACE} fontFamily="var(--font-mono)">
            Ã©#
          </text>
        </>
      ) : (
        <rect x={72} y={107} width={172} height={12} rx={6} fill={BLUE} />
      )}
    </g>
  );
}

export function CorruptionRowDiagram({ action }: { action: CorruptionAction }) {
  const variant = VARIANT_BY_TYPE[action.type] ?? "intact";
  const dropped = variant === "dropped";
  const duplicated = variant === "duplicated";

  return (
    <Frame
      viewBox="0 0 640 220"
      minWidth={380}
      label={`Sơ đồ: ${action.type} biến đổi một record như thế nào`}
    >
      <text x={0} y={14} fontSize={13} fill={INK_FAINT} fontFamily="var(--font-mono)">
        trước
      </text>
      <RecordCard x={0} y={24} variant="intact" />

      <line x1={276} y1={90} x2={344} y2={90} stroke={RED} strokeWidth={3} />
      <path d="M 344 90 l -13 -8 l 0 16 z" fill={RED} />

      <text x={360} y={14} fontSize={13} fill={RED} fontFamily="var(--font-mono)">
        sau
      </text>

      {dropped ? (
        <g>
          <RecordCard x={360} y={24} variant="intact" faded />
          <line x1={368} y1={32} x2={612} y2={148} stroke={RED} strokeWidth={4} />
          <line x1={612} y1={32} x2={368} y2={148} stroke={RED} strokeWidth={4} />
          <text x={490} y={190} fontSize={19} textAnchor="middle" fill={RED} fontWeight={700}>
            dòng biến mất khỏi dataset
          </text>
        </g>
      ) : duplicated ? (
        <g>
          <RecordCard x={372} y={16} variant="intact" faded />
          <RecordCard x={360} y={38} variant="intact" />
          <text x={490} y={200} fontSize={19} textAnchor="middle" fill={RED} fontWeight={700}>
            paper_id không còn duy nhất
          </text>
        </g>
      ) : (
        <RecordCard x={360} y={24} variant={variant} />
      )}
    </Frame>
  );
}

/* ========================================================================== */
/* 2 · Damage by corruption type                                              */
/* ========================================================================== */

export function DamageBars({
  groups,
  control,
  gateItems,
}: {
  groups: ImpactGroup[];
  control: ImpactGroup | null;
  gateItems: Detectability[];
}) {
  const gateByType = new Map(gateItems.map((item) => [item.type, item]));
  const ordered = [...groups].sort((a, b) => a.tokenF1 - b.tokenF1);
  const rows: ImpactGroup[] = control ? [...ordered, control] : ordered;

  const rowH = 54;
  const top = 56;
  const left = 250;
  const right = 1000;
  const width = right - left;
  const height = top + rows.length * rowH + 16;
  // value labels live in the gutter to the right of the axis, badges beyond it,
  // so a full-length bar never pushes its own label off the drawing
  const badgeX = 1096;

  return (
    <Frame
      viewBox={`0 0 1280 ${height}`}
      minWidth={900}
      label="Biểu đồ token F1 còn lại của từng nhóm câu hỏi, xếp theo mức thiệt hại"
      caption="Thanh nhạt là phần chất lượng đã mất. Nhóm “không bị đụng” là nhóm đối chứng — vẫn hoàn hảo."
    >
      {/* axis */}
      <line x1={left} y1={top - 14} x2={left} y2={top + rows.length * rowH} stroke={LINE} strokeWidth={1} />
      <line
        x1={right}
        y1={top - 14}
        x2={right}
        y2={top + rows.length * rowH}
        stroke={LINE}
        strokeWidth={1}
      />
      <text x={left} y={top - 24} fontSize={14} fill={INK_FAINT} textAnchor="middle">
        0
      </text>
      <text x={right} y={top - 24} fontSize={14} fill={INK_FAINT} textAnchor="middle">
        1.0
      </text>
      <text x={left + width / 2} y={22} fontSize={16} fill={INK_SOFT} textAnchor="middle">
        mean token_f1 còn lại
      </text>

      {rows.map((group, index) => {
        const y = top + index * rowH;
        const isControl = group.type === null;
        const detail = group.type ? gateByType.get(group.type) : undefined;
        const barW = Math.max(group.tokenF1 * width, 2);
        const fill = isControl ? BLUE : RED;
        const track = isControl ? "var(--color-brand-blue-100)" : "var(--color-brand-red-100)";
        return (
          <g key={group.type ?? "__control__"}>
            <text
              x={left - 16}
              y={y + 26}
              fontSize={17}
              textAnchor="end"
              fill={INK}
              fontFamily="var(--font-mono)"
              fontWeight={isControl ? 500 : 650}
            >
              {group.type ?? "không bị đụng"}
            </text>
            <rect x={left} y={y + 8} width={width} height={26} rx={4} fill={track} />
            <rect x={left} y={y + 8} width={barW} height={26} rx={4} fill={fill} />
            <text
              x={right + 14}
              y={y + 28}
              fontSize={20}
              fill={INK}
              fontWeight={700}
              fontFamily="var(--font-mono)"
            >
              {formatMetric(group.tokenF1, 3)}
            </text>
            {detail && !detail.visible ? (
              <g transform={`translate(${badgeX} ${y + 10})`}>
                <rect
                  width={150}
                  height={24}
                  rx={12}
                  fill={RED_SOFT}
                  stroke={RED_LINE}
                  strokeWidth={1.5}
                />
                <text x={75} y={17} fontSize={13} textAnchor="middle" fill={RED} fontWeight={700}>
                  gate không thấy
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

    </Frame>
  );
}

/* ========================================================================== */
/* 3 · Every question, every run                                              */
/* ========================================================================== */

export interface VerdictRun {
  state: RunState;
  /** one entry per question, in a stable order, true when the judge said correct */
  correct: boolean[];
}

/**
 * One cell per question, one row per run.
 *
 * Filled in the run's own colour = the judge marked it correct. Hollow with a
 * red slash = wrong. The corrupted row reads as a row full of holes, and the
 * repaired row fills straight back in.
 */
export function AnswerGrid({ runs }: { runs: VerdictRun[] }) {
  const columns = Math.max(...runs.map((run) => run.correct.length), 0);
  if (columns === 0) return null;

  const labelW = 180;
  const pitch = 16;
  const cell = 13;
  const rowPitch = 52;
  const width = labelW + columns * pitch + 60;
  const height = 44 + runs.length * rowPitch;

  const fillOf: Record<RunState, string> = {
    baseline: BLUE,
    corrupted: RED,
    repaired: GREEN,
  };

  return (
    <Frame
      viewBox={`0 0 ${width} ${height}`}
      minWidth={Math.min(width, 1000)}
      label="Lưới kết quả: mỗi ô là một câu hỏi, mỗi hàng là một lần chạy"
      caption="Ô đặc = LLM judge chấm đúng. Ô rỗng có gạch đỏ = chấm sai. Thứ tự câu hỏi giống nhau ở cả ba hàng."
    >
      {runs.map((run, rowIndex) => {
        const y = 34 + rowIndex * rowPitch;
        const wrong = run.correct.filter((value) => !value).length;
        return (
          <g key={run.state}>
            <rect x={0} y={y - 2} width={14} height={14} rx={3} fill={fillOf[run.state]} />
            <text x={24} y={y + 11} fontSize={19} fontWeight={700} fill={INK}>
              {run.state}
            </text>
            <text x={24} y={y + 32} fontSize={14} fill={wrong > 0 ? RED : INK_FAINT}>
              {wrong > 0
                ? `${formatInt(wrong)}/${formatInt(run.correct.length)} sai`
                : `${formatInt(run.correct.length)}/${formatInt(run.correct.length)} đúng`}
            </text>

            {run.correct.map((ok, index) => {
              const x = labelW + index * pitch;
              return ok ? (
                <rect
                  key={index}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell * 2}
                  rx={3}
                  fill={fillOf[run.state]}
                />
              ) : (
                <g key={index}>
                  <rect
                    x={x}
                    y={y}
                    width={cell}
                    height={cell * 2}
                    rx={3}
                    fill={SURFACE}
                    stroke={RED}
                    strokeWidth={1.5}
                  />
                  <line
                    x1={x + 2}
                    y1={y + cell * 2 - 2}
                    x2={x + cell - 2}
                    y2={y + 2}
                    stroke={RED}
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </Frame>
  );
}

/* ========================================================================== */
/* 4 · The observability gap                                                  */
/* ========================================================================== */

export function ObservabilityGap({
  items,
  checks,
}: {
  items: Detectability[];
  checks: { key: string; status: string | null; passed: boolean | null }[];
}) {
  const rowH = 62;
  const rows = Math.max(items.length, checks.length);
  const height = 70 + rows * rowH + 10;
  const leftX = 20;
  const leftW = 300;
  const rightX = 800;
  const rightW = 330;

  const leftY = (index: number) => 70 + index * rowH + (rows - items.length) * (rowH / 2);
  const rightY = (index: number) => 70 + index * rowH + (rows - checks.length) * (rowH / 2);
  const checkIndex = new Map(checks.map((check, index) => [check.key, index]));

  return (
    <Frame
      viewBox={`0 0 1180 ${height}`}
      minWidth={920}
      label="Sơ đồ nối từng dạng corruption với các quality check bắt được chúng"
      caption="Đường xanh lá = check đã bắt được dạng lỗi đó. Khoảng trống bên phải các nút đỏ chính là vùng mù của observability."
    >
      <text x={leftX} y={34} fontSize={19} fill={RED} fontWeight={700}>
        Dạng lỗi đã xảy ra
      </text>
      <text x={rightX} y={34} fontSize={19} fill={BLUE_DEEP} fontWeight={700}>
        Quality check đang chạy
      </text>

      {/* connectors first, so nodes sit on top */}
      {items.map((item, index) => {
        const y = leftY(index) + 22;
        if (!item.visible) {
          return (
            <g key={`stub-${item.type}`}>
              <line
                x1={leftX + leftW}
                y1={y}
                x2={leftX + leftW + 150}
                y2={y}
                stroke={RED}
                strokeWidth={2.5}
                strokeDasharray="7 6"
              />
              <line
                x1={leftX + leftW + 152}
                y1={y - 9}
                x2={leftX + leftW + 170}
                y2={y + 9}
                stroke={RED}
                strokeWidth={3}
              />
              <line
                x1={leftX + leftW + 170}
                y1={y - 9}
                x2={leftX + leftW + 152}
                y2={y + 9}
                stroke={RED}
                strokeWidth={3}
              />
              {/* halo keeps the label readable where it crosses a connector */}
              <text
                x={leftX + leftW + 182}
                y={y + 6}
                fontSize={16}
                fill={RED}
                fontWeight={650}
                stroke={SURFACE}
                strokeWidth={5}
                paintOrder="stroke"
              >
                không nối tới check nào
              </text>
            </g>
          );
        }
        return item.caughtBy.map((key) => {
          const target = checkIndex.get(key);
          if (target === undefined) return null;
          const ty = rightY(target) + 22;
          return (
            <path
              key={`${item.type}-${key}`}
              d={`M ${leftX + leftW} ${y} C ${leftX + leftW + 180} ${y} ${rightX - 180} ${ty} ${rightX} ${ty}`}
              fill="none"
              stroke={GREEN}
              strokeWidth={3}
            />
          );
        });
      })}

      {items.map((item, index) => {
        const y = leftY(index);
        return (
          <g key={item.type}>
            <rect
              x={leftX}
              y={y}
              width={leftW}
              height={44}
              rx={10}
              fill={item.visible ? SURFACE : RED_SOFT}
              stroke={item.visible ? LINE : RED}
              strokeWidth={item.visible ? 1.5 : 2.5}
            />
            <text
              x={leftX + 14}
              y={y + 28}
              fontSize={17}
              fill={INK}
              fontFamily="var(--font-mono)"
              fontWeight={650}
            >
              {item.type}
            </text>
            <text
              x={leftX + leftW - 14}
              y={y + 28}
              fontSize={15}
              textAnchor="end"
              fill={INK_FAINT}
              fontFamily="var(--font-mono)"
            >
              {formatInt(item.rowsAffected ?? 0)}
            </text>
          </g>
        );
      })}

      {checks.map((check, index) => {
        const y = rightY(index);
        const failed = check.passed === false;
        return (
          <g key={check.key}>
            <rect
              x={rightX}
              y={y}
              width={rightW}
              height={44}
              rx={10}
              fill={failed ? GREEN_SOFT : CANVAS}
              stroke={failed ? GREEN_LINE : LINE}
              strokeWidth={failed ? 2.5 : 1.5}
            />
            <text
              x={rightX + 14}
              y={y + 28}
              fontSize={17}
              fill={INK}
              fontFamily="var(--font-mono)"
            >
              {check.key}
            </text>
            <text
              x={rightX + rightW - 14}
              y={y + 28}
              fontSize={14}
              textAnchor="end"
              fill={failed ? GREEN : INK_FAINT}
              fontWeight={700}
            >
              {check.status ?? "—"}
            </text>
          </g>
        );
      })}

    </Frame>
  );
}

/* ========================================================================== */
/* 4 · Crawl: from a public API to typed records                              */
/* ========================================================================== */

export function CrawlDiagram({
  apiName,
  maxResults,
  recordCount,
}: {
  apiName: string;
  maxResults: number | null;
  recordCount: number | null;
}) {
  const stack = recordCount === null ? 0 : Math.min(recordCount, 24);

  return (
    <Frame
      viewBox="0 0 1200 260"
      minWidth={900}
      label="Sơ đồ crawl: gọi Crossref REST API, lưu raw response, parse thành PaperRecord"
    >
      <defs>
        <marker
          id="crawl-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={INK_FAINT} />
        </marker>
      </defs>

      {/* the public API */}
      <rect x={20} y={64} width={250} height={96} rx={48} fill={CANVAS} stroke={LINE} strokeWidth={2} />
      <text x={145} y={104} textAnchor="middle" fontSize={21} fontWeight={700} fill={INK}>
        {apiName}
      </text>
      <text x={145} y={130} textAnchor="middle" fontSize={15} fill={INK_SOFT}>
        nguồn công khai
      </text>

      <line x1={270} y1={112} x2={330} y2={112} stroke={INK_FAINT} strokeWidth={2} markerEnd="url(#crawl-arrow)" />
      <text x={300} y={100} textAnchor="middle" fontSize={13} fill={INK_FAINT} fontFamily="var(--font-mono)">
        GET
      </text>

      {/* raw response */}
      <rect x={330} y={54} width={240} height={116} rx={12} fill={SURFACE} stroke={LINE} strokeWidth={2} />
      <text x={450} y={88} textAnchor="middle" fontSize={19} fontWeight={650} fill={INK}>
        raw response
      </text>
      <text
        x={450}
        y={112}
        textAnchor="middle"
        fontSize={13}
        fill={INK_SOFT}
        fontFamily="var(--font-mono)"
      >
        crossref_response.json
      </text>
      <text x={450} y={142} textAnchor="middle" fontSize={14} fill={INK_FAINT}>
        giữ nguyên trạng để truy vết
      </text>

      <line x1={570} y1={112} x2={630} y2={112} stroke={INK_FAINT} strokeWidth={2} markerEnd="url(#crawl-arrow)" />
      <text x={600} y={100} textAnchor="middle" fontSize={13} fill={INK_FAINT} fontFamily="var(--font-mono)">
        parse
      </text>

      {/* typed records */}
      <rect x={630} y={54} width={230} height={116} rx={12} fill={BLUE_SOFT} stroke={BLUE} strokeWidth={2.5} />
      <text x={745} y={88} textAnchor="middle" fontSize={19} fontWeight={650} fill={INK}>
        PaperRecord
      </text>
      <text
        x={745}
        y={112}
        textAnchor="middle"
        fontSize={13}
        fill={INK_SOFT}
        fontFamily="var(--font-mono)"
      >
        crossref_records.json
      </text>
      <text x={745} y={142} textAnchor="middle" fontSize={14} fill={INK_FAINT}>
        record có kiểu rõ ràng
      </text>

      <line x1={860} y1={112} x2={920} y2={112} stroke={INK_FAINT} strokeWidth={2} markerEnd="url(#crawl-arrow)" />

      {/* the record stack, one square per record actually fetched */}
      <text x={920} y={44} fontSize={15} fill={INK_FAINT}>
        mỗi ô = 1 record thật
      </text>
      {Array.from({ length: stack }, (_, index) => (
        <rect
          key={index}
          x={920 + (index % 8) * 30}
          y={56 + Math.floor(index / 8) * 30}
          width={24}
          height={24}
          rx={5}
          fill={BLUE}
        />
      ))}
      <text x={920} y={168} fontSize={34} fontWeight={700} fill={BLUE_DEEP}>
        {recordCount === null ? "—" : formatInt(recordCount)}
      </text>
      <text x={920} y={192} fontSize={15} fill={INK_SOFT}>
        record đã lấy về
        {maxResults !== null ? ` · trần ${formatInt(maxResults)}` : ""}
      </text>
    </Frame>
  );
}

/* ========================================================================== */
/* 5 · Published dates, as a column chart                                     */
/* ========================================================================== */

export function MonthlyColumns({
  data,
  caption,
}: {
  data: { month: string; count: number }[];
  caption?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((item) => item.count), 1);
  const colW = 74;
  const plotH = 190;
  const width = Math.max(data.length * colW + 90, 560);
  const height = plotH + 62;

  return (
    <Frame
      viewBox={`0 0 ${width} ${height}`}
      minWidth={Math.min(width, 620)}
      label="Số paper theo tháng xuất bản"
      caption={caption}
    >
      {/* baseline */}
      <line x1={60} y1={plotH + 20} x2={width - 20} y2={plotH + 20} stroke={LINE} strokeWidth={1} />
      <text x={52} y={plotH + 25} fontSize={13} textAnchor="end" fill={INK_FAINT}>
        0
      </text>
      <text x={52} y={34} fontSize={13} textAnchor="end" fill={INK_FAINT}>
        {max}
      </text>

      {data.map((item, index) => {
        const h = Math.max((item.count / max) * (plotH - 40), 3);
        const x = 70 + index * colW;
        return (
          <g key={item.month}>
            <rect x={x} y={plotH + 20 - h} width={24} height={h} rx={4} fill={BLUE} />
            <text
              x={x + 12}
              y={plotH + 8 - h}
              textAnchor="middle"
              fontSize={18}
              fontWeight={700}
              fill={INK}
            >
              {item.count}
            </text>
            <text
              x={x + 12}
              y={plotH + 44}
              textAnchor="middle"
              fontSize={14}
              fill={INK_SOFT}
              fontFamily="var(--font-mono)"
            >
              {item.month}
            </text>
          </g>
        );
      })}

    </Frame>
  );
}

/* ========================================================================== */
/* 6 · The clean contract as a wiring diagram                                  */
/* ========================================================================== */

export function ContractDiagram({ graph }: { graph: ContractGraph }) {
  const rowH = 34;
  const rows = Math.max(graph.sources.length, graph.derived.length * 2);
  const height = 76 + rows * rowH + 16;

  const srcX = 20;
  const srcW = 260;
  const derX = 430;
  const derW = 270;
  const conX = 860;
  const conW = 300;

  const sourceY = (index: number) => 70 + index * rowH;
  const derivedY = (index: number) =>
    70 + (index + 0.5) * (rows / Math.max(graph.derived.length, 1)) * rowH - 12;

  const consumers: { key: string; label: string; detail: string; tone: "blue" | "green" }[] = [];
  if (graph.embedded) {
    consumers.push({
      key: "__index__",
      label: "index → vector",
      detail: graph.embedded,
      tone: "blue",
    });
  }
  const watchedColumns = [...new Set(graph.watched.map((entry) => entry.column))];
  for (const entry of graph.watched) {
    if (consumers.some((item) => item.key === entry.check)) continue;
    consumers.push({
      key: entry.check,
      label: entry.check,
      detail: "quality check",
      tone: "green",
    });
  }

  const consumerY = (index: number) =>
    70 + (index + 0.5) * (rows / Math.max(consumers.length, 1)) * rowH - 12;
  const consumerIndex = new Map(consumers.map((item, index) => [item.key, index]));
  const sourceIndex = new Map(graph.sources.map((name, index) => [name, index]));
  const derivedIndex = new Map(graph.derived.map((name, index) => [name, index]));

  return (
    <Frame
      viewBox={`0 0 1180 ${height}`}
      minWidth={920}
      label="Sơ đồ contract: cột nguồn sinh ra cột derived, và ai đọc cột nào"
      caption={
        <>
          Xanh dương: cột nguồn → cột derived → model embedding. Xanh lá: cột đang có quality
          check theo dõi. Cột không có đường nối nào là cột không ai nhìn.
          {graph.datasetChecks.length > 0 ? (
            <>
              {" "}
              Check chạy trên cả dataset:{" "}
              <span className="font-mono">
                {graph.datasetChecks.map((item) => item.check).join(", ")}
              </span>
              .
            </>
          ) : null}
        </>
      }
    >
      <text x={srcX} y={34} fontSize={19} fill={INK_SOFT} fontWeight={700}>
        {graph.sources.length} cột từ source
      </text>
      <text x={derX} y={34} fontSize={19} fill={BLUE_DEEP} fontWeight={700}>
        {graph.derived.length} cột derived
      </text>
      <text x={conX} y={34} fontSize={19} fill={INK_SOFT} fontWeight={700}>
        ai đọc cột nào
      </text>

      {/* source -> derived */}
      {graph.derivations.map((edge) => {
        const from = sourceIndex.get(edge.source);
        const to = derivedIndex.get(edge.derived);
        if (from === undefined || to === undefined) return null;
        const y1 = sourceY(from) + 13;
        const y2 = derivedY(to) + 13;
        return (
          <path
            key={`${edge.source}->${edge.derived}`}
            d={`M ${srcX + srcW} ${y1} C ${srcX + srcW + 70} ${y1} ${derX - 70} ${y2} ${derX} ${y2}`}
            fill="none"
            stroke={BLUE}
            strokeWidth={2}
            opacity={0.55}
          />
        );
      })}

      {/* embedded column -> index consumer */}
      {graph.embedded && consumerIndex.has("__index__") ? (
        <path
          d={`M ${derX + derW} ${derivedY(derivedIndex.get(graph.embedded) ?? 0) + 13} C ${derX + derW + 70} ${derivedY(derivedIndex.get(graph.embedded) ?? 0) + 13} ${conX - 70} ${consumerY(consumerIndex.get("__index__") ?? 0) + 13} ${conX} ${consumerY(consumerIndex.get("__index__") ?? 0) + 13}`}
          fill="none"
          stroke={BLUE_DEEP}
          strokeWidth={3}
        />
      ) : null}

      {/* watched columns -> checks */}
      {graph.watched.map((entry) => {
        const target = consumerIndex.get(entry.check);
        if (target === undefined) return null;
        const asSource = sourceIndex.get(entry.column);
        const asDerived = derivedIndex.get(entry.column);
        const startX = asDerived !== undefined ? derX + derW : srcX + srcW;
        const startY =
          asDerived !== undefined
            ? derivedY(asDerived) + 13
            : asSource !== undefined
              ? sourceY(asSource) + 13
              : null;
        if (startY === null) return null;
        const endY = consumerY(target) + 13;
        return (
          <path
            key={`${entry.column}->${entry.check}`}
            d={`M ${startX} ${startY} C ${startX + 90} ${startY} ${conX - 90} ${endY} ${conX} ${endY}`}
            fill="none"
            stroke={GREEN}
            strokeWidth={2.5}
            opacity={0.75}
          />
        );
      })}

      {graph.sources.map((name, index) => (
        <g key={name}>
          <rect
            x={srcX}
            y={sourceY(index)}
            width={srcW}
            height={26}
            rx={7}
            fill={watchedColumns.includes(name) ? SURFACE : CANVAS}
            stroke={LINE}
            strokeWidth={1.5}
          />
          <text
            x={srcX + 12}
            y={sourceY(index) + 18}
            fontSize={15}
            fill={INK}
            fontFamily="var(--font-mono)"
          >
            {name}
          </text>
        </g>
      ))}

      {graph.derived.map((name, index) => (
        <g key={name}>
          <rect
            x={derX}
            y={derivedY(index)}
            width={derW}
            height={26}
            rx={7}
            fill={BLUE_SOFT}
            stroke={name === graph.embedded ? BLUE_DEEP : "var(--color-brand-blue-200)"}
            strokeWidth={name === graph.embedded ? 2.5 : 1.5}
          />
          <text
            x={derX + 12}
            y={derivedY(index) + 18}
            fontSize={15}
            fill={INK}
            fontFamily="var(--font-mono)"
            fontWeight={name === graph.embedded ? 700 : 400}
          >
            {name}
          </text>
        </g>
      ))}

      {consumers.map((consumer, index) => (
        <g key={consumer.key}>
          <rect
            x={conX}
            y={consumerY(index)}
            width={conW}
            height={26}
            rx={7}
            fill={consumer.tone === "blue" ? BLUE_SOFT : GREEN_SOFT}
            stroke={consumer.tone === "blue" ? BLUE_DEEP : GREEN_LINE}
            strokeWidth={consumer.tone === "blue" ? 2.5 : 1.5}
          />
          <text
            x={conX + 12}
            y={consumerY(index) + 18}
            fontSize={15}
            fill={INK}
            fontFamily="var(--font-mono)"
          >
            {consumer.label}
          </text>
        </g>
      ))}

    </Frame>
  );
}
