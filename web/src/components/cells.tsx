import { formatInt } from "@/lib/format";
import { Clamp } from "./data-table";

/** Renders a `string[]` cell with its real length badge. */
export function ArrayCell({ values }: { values: unknown }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  const text = values.map((value) => String(value)).join(", ");
  return (
    <span className="break-anywhere" title={text}>
      <span className="mr-1 rounded bg-canvas px-1 font-mono text-[11px] text-ink-faint">
        {values.length}
      </span>
      {text}
    </span>
  );
}

export function LinkCell({ href }: { href: unknown }) {
  if (typeof href !== "string" || href.length === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  if (!/^https?:\/\//i.test(href)) {
    return <span className="break-anywhere font-mono text-xs text-ink-soft">{href}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="break-anywhere font-mono text-xs text-brand-blue underline underline-offset-2"
    >
      {href}
    </a>
  );
}

/**
 * Renders an arbitrary artifact value without assuming which column it is.
 * Type is inspected at runtime so the table stays driven by the file, not by a
 * hardcoded column schema.
 */
export function AutoCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-faint">—</span>;
  }
  if (Array.isArray(value)) return <ArrayCell values={value} />;
  if (typeof value === "number") {
    return <span className="font-mono tabular-nums">{formatInt(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="font-mono">{String(value)}</span>;
  }
  if (typeof value === "object") {
    return (
      <span className="break-anywhere font-mono text-[11px] text-ink-soft">
        {JSON.stringify(value)}
      </span>
    );
  }
  const text = String(value);
  if (/^https?:\/\//i.test(text)) return <LinkCell href={text} />;
  if (text.length > 90) return <Clamp text={text} lines={3} />;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return <span className="whitespace-nowrap font-mono text-xs">{text}</span>;
  }
  return <span className="break-anywhere">{text}</span>;
}
