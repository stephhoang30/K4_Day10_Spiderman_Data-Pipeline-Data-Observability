import type { ReactNode } from "react";
import { formatMetric } from "@/lib/format";
import type { RunState } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* One colour language, used identically on every page                         */
/* -------------------------------------------------------------------------- */

/**
 * blue = baseline / structure, red = corrupted / failed, green = repaired.
 * These three hexes were checked with the dataviz palette validator against a
 * white surface: lightness band, chroma floor, CVD separation, contrast — all
 * pass. Every mark is also directly labelled, so identity never rests on hue.
 */
export const SERIES: Record<RunState, { fill: string; track: string; label: string }> = {
  baseline: {
    fill: "var(--color-brand-blue-600)",
    track: "var(--color-brand-blue-100)",
    label: "baseline",
  },
  corrupted: {
    fill: "var(--color-brand-red)",
    track: "var(--color-brand-red-100)",
    label: "corrupted",
  },
  repaired: {
    fill: "var(--color-ok)",
    track: "var(--color-ok-100)",
    label: "repaired",
  },
};

export function SeriesLegend({
  states,
  note,
}: {
  states: RunState[];
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {states.map((state) => (
        <span key={state} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 rounded-sm"
            style={{ backgroundColor: SERIES[state].fill }}
          />
          <span className="text-base font-medium text-ink">{SERIES[state].label}</span>
        </span>
      ))}
      {note ? <span className="text-sm text-ink-faint">{note}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Horizontal meter — the workhorse                                            */
/* -------------------------------------------------------------------------- */

export interface MeterRow {
  key: string;
  /** left-hand label */
  name: ReactNode;
  value: number;
  /** shown at the bar tip; falls back to the value formatted to 3 digits */
  display?: string;
  fill: string;
  track: string;
  /** small annotation under the row */
  note?: ReactNode;
  /** right-hand badge, e.g. a delta pill */
  badge?: ReactNode;
}

/**
 * Rows of horizontal meters sharing one domain.
 *
 * A meter, not a bar chart: the track is a lighter step of the bar's own hue so
 * the *missing* part of the value reads as shape from across a room. Values are
 * labelled at the tip; the axis maximum is printed once underneath.
 */
export function Meters({
  rows,
  domainMax,
  labelWidth = "9rem",
  valueClassName = "text-2xl",
  barHeight = 24,
}: {
  rows: MeterRow[];
  domainMax: number;
  labelWidth?: string;
  valueClassName?: string;
  barHeight?: number;
}) {
  const max = domainMax > 0 ? domainMax : 1;
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => {
        const ratio = Math.max(0, Math.min(1, row.value / max));
        return (
          <li key={row.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-4">
              <span
                className="shrink-0 text-base font-semibold text-ink-soft"
                style={{ width: labelWidth }}
              >
                {row.name}
              </span>
              <span
                className="relative min-w-0 flex-1 overflow-hidden rounded-[4px]"
                style={{ height: barHeight, backgroundColor: row.track }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${ratio * 100}%`, backgroundColor: row.fill }}
                />
              </span>
              <span
                className={`shrink-0 text-right font-semibold text-ink ${valueClassName}`}
                style={{ width: "5.5rem" }}
              >
                {row.display ?? formatMetric(row.value, 3)}
              </span>
              {row.badge ? <span className="shrink-0">{row.badge}</span> : null}
            </div>
            {row.note ? (
              <p className="text-sm text-ink-faint" style={{ paddingLeft: labelWidth }}>
                <span className="ml-4 block">{row.note}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Delta pill                                                                  */
/* -------------------------------------------------------------------------- */

export function DeltaPill({ delta }: { delta: string | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex w-24 justify-center rounded-full border border-line bg-canvas px-2 py-1 text-sm font-semibold text-ink-faint">
        gốc
      </span>
    );
  }
  const down = delta.startsWith("−");
  const up = delta.startsWith("+");
  const tone = down
    ? "border-brand-red-200 bg-brand-red-50 text-brand-red-700"
    : up
      ? "border-ok-200 bg-ok-50 text-ok"
      : "border-line bg-canvas text-ink-faint";
  return (
    <span
      className={`inline-flex w-24 justify-center rounded-full border px-2 py-1 font-mono text-sm font-semibold tabular-nums ${tone}`}
    >
      {delta}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* PASS / FAIL verdict                                                         */
/* -------------------------------------------------------------------------- */

/**
 * PASS / FAIL exactly as the artifact wrote it.
 *
 * `passLabel` is the status a cleanly-passing check uses in this report. A check
 * that passed under a different label (a warning) is styled neutrally rather
 * than green, so a non-PASS word never rides a green tick.
 */
export function Verdict({
  status,
  passed,
  size = "md",
  passLabel,
}: {
  status: string | null;
  passed: boolean | null;
  size?: "sm" | "md" | "lg";
  passLabel?: string | null;
}) {
  const bad = passed === false;
  const noted =
    passed === true && Boolean(passLabel) && Boolean(status) && status !== passLabel;
  const ok = passed === true && !noted;
  const tone = ok
    ? "border-ok-200 bg-ok-50 text-ok"
    : bad
      ? "border-brand-red-200 bg-brand-red-50 text-brand-red-700"
      : "border-line bg-canvas text-ink-soft";
  const scale =
    size === "lg"
      ? "px-4 py-1.5 text-xl"
      : size === "sm"
        ? "px-2 py-0.5 text-sm"
        : "px-3 py-1 text-base";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-bold tracking-wide ${tone} ${scale}`}
    >
      <span aria-hidden>{ok ? "✓" : bad ? "✕" : noted ? "!" : "?"}</span>
      {status ?? "—"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Isotype — one square per row                                                */
/* -------------------------------------------------------------------------- */

export function Isotype({
  count,
  fill,
  hollow = false,
  size = 18,
  max = 40,
}: {
  count: number;
  fill: string;
  hollow?: boolean;
  size?: number;
  max?: number;
}) {
  const shown = Math.max(0, Math.min(count, max));
  return (
    <span className="flex flex-wrap items-center gap-1" aria-hidden>
      {Array.from({ length: shown }, (_, index) => (
        <span
          key={index}
          className="inline-block rounded-[3px]"
          style={{
            width: size,
            height: size,
            backgroundColor: hollow ? "transparent" : fill,
            border: hollow ? `2px dashed ${fill}` : "none",
          }}
        />
      ))}
      {count > shown ? (
        <span className="text-sm text-ink-faint">+{count - shown}</span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Before → after, as shape                                                    */
/* -------------------------------------------------------------------------- */

export function BeforeAfter({
  label,
  before,
  after,
  beforeLabel,
  afterLabel,
  tone = "red",
}: {
  label: string;
  before: number;
  after: number;
  beforeLabel: string;
  afterLabel: string;
  tone?: "red" | "green";
}) {
  const max = Math.max(before, after, 1);
  const afterFill =
    tone === "red" ? "var(--color-brand-red)" : "var(--color-ok)";
  const delta = after - before;
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <div className="mt-4 flex items-baseline gap-3">
        <span className="text-5xl font-semibold text-brand-blue">{before}</span>
        <span aria-hidden className="text-3xl text-ink-faint">
          →
        </span>
        <span className="text-5xl font-semibold" style={{ color: afterFill }}>
          {after}
        </span>
        {delta !== 0 ? (
          <span
            className="ml-1 rounded-full border border-brand-red-200 bg-brand-red-50 px-2.5 py-1 font-mono text-base font-semibold text-brand-red-700"
            style={
              tone === "green"
                ? {
                    borderColor: "var(--color-ok-200)",
                    backgroundColor: "var(--color-ok-50)",
                    color: "var(--color-ok)",
                  }
                : undefined
            }
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <span className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-ink-faint">{beforeLabel}</span>
          <span
            className="h-4 rounded-[4px]"
            style={{
              width: `${(before / max) * 100}%`,
              backgroundColor: "var(--color-brand-blue-600)",
            }}
          />
        </span>
        <span className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-sm text-ink-faint">{afterLabel}</span>
          <span
            className="h-4 rounded-[4px]"
            style={{ width: `${(after / max) * 100}%`, backgroundColor: afterFill }}
          />
        </span>
      </div>
    </div>
  );
}
