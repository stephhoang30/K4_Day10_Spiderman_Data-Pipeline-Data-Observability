import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Page scaffolding                                                            */
/* -------------------------------------------------------------------------- */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}

export function PageHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">
        {eyebrow}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">{lede}</p>
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  aside,
  children,
  tone = "default",
}: {
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  tone?: "default" | "alert";
}) {
  const accent =
    tone === "alert" ? "border-t-brand-red" : "border-t-brand-blue";
  return (
    <section
      className={`overflow-hidden rounded-lg border border-line border-t-2 bg-surface shadow-[0_1px_2px_rgba(22,32,44,0.05)] ${accent}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small primitives                                                            */
/* -------------------------------------------------------------------------- */

type BadgeTone = "neutral" | "blue" | "red" | "ok" | "muted";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-canvas text-ink-soft",
  blue: "border-brand-blue-200 bg-brand-blue-50 text-brand-blue-700",
  red: "border-brand-red-200 bg-brand-red-50 text-brand-red-700",
  ok: "border-ok-200 bg-ok-50 text-ok",
  muted: "border-line bg-line-soft text-ink-faint",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="break-anywhere rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px] text-ink">
      {children}
    </code>
  );
}

export function PathChip({ path }: { path: string }) {
  return (
    <span className="break-anywhere inline-block rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[12px] text-ink-soft">
      {path}
    </span>
  );
}

/** Horizontal scroll container. Wide tables scroll here, never the page body. */
export function ScrollShell({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-shell -mx-5 max-w-[calc(100%+2.5rem)] overflow-x-auto px-5">
      {children}
    </div>
  );
}

export function KeyValueList({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[minmax(9rem,auto)_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint sm:pt-0.5">
            {item.label}
          </dt>
          <dd className="break-anywhere min-w-0 text-sm text-ink">
            {item.value}
            {item.hint ? (
              <span className="mt-0.5 block text-xs text-ink-faint">{item.hint}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "blue" | "red" | "ok";
}) {
  const ring =
    tone === "red"
      ? "border-brand-red-200 bg-brand-red-50"
      : tone === "ok"
        ? "border-ok-200 bg-ok-50"
        : tone === "blue"
          ? "border-brand-blue-200 bg-brand-blue-50"
          : "border-line bg-canvas";
  return (
    <div className={`rounded-lg border px-4 py-3 ${ring}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Note({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  const style =
    tone === "warn"
      ? "border-brand-red-200 bg-brand-red-50 text-brand-red-700"
      : "border-brand-blue-200 bg-brand-blue-50 text-brand-blue-700";
  return (
    <p className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${style}`}>
      {children}
    </p>
  );
}

/** A terminal command, rendered so it can be copied by hand. */
export function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="scroll-shell overflow-x-auto rounded-md border border-line bg-ink px-3 py-2 font-mono text-[12.5px] leading-relaxed text-white">
      <code>
        <span className="select-none text-brand-blue-200">$ </span>
        {command}
      </code>
    </pre>
  );
}

export function Collapsible({
  summary,
  children,
  hint,
}: {
  summary: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border border-line bg-canvas open:bg-surface">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-brand-blue marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          {summary}
        </span>
        {hint ? <span className="ml-2 text-xs text-ink-faint">{hint}</span> : null}
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}
