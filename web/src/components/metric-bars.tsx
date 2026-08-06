import { formatDelta, formatMetric } from "@/lib/format";
import type { RunState } from "@/lib/types";

export const STATE_COLOR: Record<RunState, string> = {
  baseline: "var(--color-brand-blue)",
  corrupted: "var(--color-brand-red)",
  repaired: "var(--color-ok)",
};

export interface MetricSeries {
  state: RunState;
  value: number;
}

/**
 * One horizontal bar chart per metric. Each chart gets its own axis, because
 * the four metrics are not guaranteed to share a scale — nothing here assumes
 * a 0..1 range unless the data itself stays inside it.
 */
export function MetricBars({
  metric,
  series,
  baseline,
}: {
  metric: string;
  series: MetricSeries[];
  baseline: number | null;
}) {
  const values = series.map((item) => item.value).filter(Number.isFinite);
  if (values.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-5">
        <p className="font-mono text-sm text-ink">{metric}</p>
        <p className="mt-1 text-xs text-ink-faint">
          Chưa có state nào có giá trị cho metric này.
        </p>
      </div>
    );
  }

  const observedMax = Math.max(...values, 0);
  const domainMax = observedMax <= 1 ? 1 : Math.ceil(observedMax * 10) / 10;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="break-anywhere font-mono text-sm font-semibold text-ink">
        {metric}
      </h3>

      <ul className="mt-3 flex flex-col gap-2.5">
        {series.map((item) => {
          const width = domainMax > 0 ? (item.value / domainMax) * 100 : 0;
          const delta =
            item.state === "baseline" ? null : formatDelta(item.value, baseline);
          return (
            <li key={item.state} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {item.state}
              </span>
              <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-canvas">
                <span
                  className="absolute inset-y-0 left-0 rounded"
                  style={{
                    width: `${Math.max(0, Math.min(100, width))}%`,
                    backgroundColor: STATE_COLOR[item.state],
                  }}
                />
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[12px] tabular-nums text-ink">
                {formatMetric(item.value)}
              </span>
              <span
                className={`w-20 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                  delta === null
                    ? "text-ink-faint"
                    : delta.startsWith("−")
                      ? "text-brand-red-700"
                      : delta.startsWith("+")
                        ? "text-ok"
                        : "text-ink-faint"
                }`}
              >
                {delta ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[11px] text-ink-faint">
        Trục 0 → {domainMax}. Cột delta so với baseline.
      </p>
    </div>
  );
}

export function StateLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-4">
      {(Object.keys(STATE_COLOR) as RunState[]).map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: STATE_COLOR[state] }}
          />
          <span className="text-xs text-ink-soft">{state}</span>
        </li>
      ))}
    </ul>
  );
}
