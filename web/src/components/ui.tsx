import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Page scaffolding                                                            */
/* -------------------------------------------------------------------------- */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[110rem] px-5 py-8 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-8">{children}</div>
    </main>
  );
}

/**
 * The one thing a viewer at the back of the room should read first.
 * `kicker` names the stage, `title` states the point of the screen in a phrase.
 */
export function PageHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-base font-bold uppercase tracking-[0.18em] text-brand-blue">
        {eyebrow}
      </p>
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
        {title}
      </h1>
      {lede ? (
        <p className="max-w-4xl text-lg leading-relaxed text-ink-soft">{lede}</p>
      ) : null}
    </header>
  );
}

/** A full-width takeaway band — the sentence the audience should leave with. */
export function Takeaway({
  tone = "blue",
  children,
  figure,
}: {
  tone?: "blue" | "red" | "ok";
  children: ReactNode;
  figure?: ReactNode;
}) {
  const style =
    tone === "red"
      ? "border-brand-red-200 bg-brand-red-50"
      : tone === "ok"
        ? "border-ok-200 bg-ok-50"
        : "border-brand-blue-200 bg-brand-blue-50";
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-6 rounded-2xl border px-6 py-5 ${style}`}
    >
      <p className="min-w-0 max-w-4xl text-2xl font-semibold leading-snug text-ink">
        {children}
      </p>
      {figure ? <div className="ml-auto shrink-0">{figure}</div> : null}
    </div>
  );
}

export function Section({
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
  tone?: "default" | "alert" | "ok";
}) {
  const accent =
    tone === "alert"
      ? "border-t-brand-red"
      : tone === "ok"
        ? "border-t-ok"
        : "border-t-brand-blue";
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-line border-t-4 bg-surface shadow-[0_1px_3px_rgba(22,32,44,0.06)] ${accent}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 max-w-4xl text-base leading-relaxed text-ink-soft">
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="px-6 pb-6 pt-5">{children}</div>
    </section>
  );
}

/** Kept for the demoted detail blocks that still want the old card chrome. */
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
  tone?: "default" | "alert" | "ok";
}) {
  return (
    <Section title={title} subtitle={subtitle} aside={aside} tone={tone}>
      {children}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Figures                                                                     */
/* -------------------------------------------------------------------------- */

/** The single largest number on a screen. At most one per view. */
export function Hero({
  value,
  label,
  caption,
  tone = "blue",
}: {
  value: ReactNode;
  label: string;
  caption?: ReactNode;
  tone?: "blue" | "red" | "ok" | "ink";
}) {
  const color =
    tone === "red"
      ? "text-brand-red"
      : tone === "ok"
        ? "text-ok"
        : tone === "ink"
          ? "text-ink"
          : "text-brand-blue";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className={`text-6xl font-semibold leading-none sm:text-7xl ${color}`}>{value}</p>
      {caption ? <p className="text-base text-ink-soft">{caption}</p> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "blue" | "red" | "ok";
  size?: "md" | "lg";
}) {
  const ring =
    tone === "red"
      ? "border-brand-red-200 bg-brand-red-50"
      : tone === "ok"
        ? "border-ok-200 bg-ok-50"
        : tone === "blue"
          ? "border-brand-blue-200 bg-brand-blue-50"
          : "border-line bg-canvas";
  const color =
    tone === "red"
      ? "text-brand-red-700"
      : tone === "ok"
        ? "text-ok"
        : tone === "blue"
          ? "text-brand-blue"
          : "text-ink";
  return (
    <div className={`rounded-xl border px-5 py-4 ${ring}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={`mt-1 font-semibold leading-tight ${color} ${
          size === "lg" ? "text-5xl" : "text-3xl"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm leading-snug text-ink-soft">{hint}</p> : null}
    </div>
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
  size = "sm",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      } ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="break-anywhere rounded bg-canvas px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  );
}

export function PathChip({ path }: { path: string }) {
  return (
    <span className="break-anywhere inline-block rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink-soft">
      {path}
    </span>
  );
}

/** Horizontal scroll container. Wide tables scroll here, never the page body. */
export function ScrollShell({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-shell -mx-6 max-w-[calc(100%+3rem)] overflow-x-auto px-6">
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
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-sm font-semibold uppercase tracking-wide text-ink-faint sm:pt-0.5">
            {item.label}
          </dt>
          <dd className="break-anywhere min-w-0 text-base text-ink">
            {item.value}
            {item.hint ? (
              <span className="mt-0.5 block text-sm text-ink-faint">{item.hint}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
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
    <p className={`rounded-lg border px-4 py-3 text-base leading-relaxed ${style}`}>
      {children}
    </p>
  );
}

/** A terminal command, rendered so it can be copied by hand. */
export function CommandBlock({ command }: { command: string }) {
  return (
    <pre className="scroll-shell overflow-x-auto rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm leading-relaxed text-white">
      <code>
        <span className="select-none text-brand-blue-200">$ </span>
        {command}
      </code>
    </pre>
  );
}

/**
 * Everything the audience does not need to read lives in one of these.
 * The presenter opens it on demand; the projector never shows it by default.
 */
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
    <details className="group rounded-xl border border-line bg-canvas open:bg-surface">
      <summary className="cursor-pointer list-none px-5 py-3.5 text-base font-semibold text-brand-blue marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          {summary}
        </span>
        {hint ? (
          <span className="ml-2 font-mono text-sm font-normal text-ink-faint">{hint}</span>
        ) : null}
      </summary>
      <div className="border-t border-line px-5 py-4">{children}</div>
    </details>
  );
}

/** A group of disclosures, visually one block so the page reads as "detail below". */
export function DetailDrawer({
  title = "Xem chi tiết",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface/60 p-5">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}
