import type { ReactNode } from "react";
import { ScrollShell } from "./ui";

/**
 * Minimal markdown renderer for `data/reports/*.md`.
 *
 * Builds React elements directly — no `dangerouslySetInnerHTML`, so report
 * content can never inject markup. Supports headings, fenced code, GFM tables,
 * lists, blockquotes, rules, links, inline code and `**bold**` / `*italic*`.
 *
 * Underscore emphasis is deliberately NOT supported: report bodies are full of
 * snake_case identifiers such as `retrieval_hit_rate`.
 */

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return null; // javascript:, data:, etc.
}

const INLINE = /(`[^`]+`)|(\[[^\]]*\]\([^)\s]*\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    const key = `${keyPrefix}-i${index++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="break-anywhere rounded bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-brand-blue-700"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = safeHref(token.slice(split + 2, -1));
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="break-anywhere text-brand-blue underline underline-offset-2 hover:text-brand-blue-700"
          >
            {label || href}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    cursor = start + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const HEADING_CLASS: Record<number, string> = {
  1: "mt-6 text-xl font-semibold tracking-tight text-ink first:mt-0",
  2: "mt-6 border-b border-line-soft pb-1 text-lg font-semibold tracking-tight text-ink first:mt-0",
  3: "mt-5 text-base font-semibold tracking-tight text-ink first:mt-0",
  4: "mt-4 text-sm font-semibold uppercase tracking-wide text-brand-blue first:mt-0",
  5: "mt-4 text-sm font-semibold text-ink-soft first:mt-0",
  6: "mt-4 text-xs font-semibold uppercase tracking-wide text-ink-faint first:mt-0",
};

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").trim();
    if (text)
      blocks.push(
        <p key={`p${key++}`} className="text-sm leading-relaxed text-ink-soft">
          {renderInline(text, `p${key}`)}
        </p>,
      );
    buffer.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (/^\s*```/.test(line)) {
      flushParagraph(paragraph);
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <ScrollShell key={`c${key++}`}>
          <pre className="overflow-x-auto rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink">
            <code>{body.join("\n")}</code>
          </pre>
        </ScrollShell>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushParagraph(paragraph);
      blocks.push(<hr key={`h${key++}`} className="my-4 border-line" />);
      i += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length;
      const Tag = (`h${Math.min(level + 1, 6)}`) as "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={`t${key++}`} className={HEADING_CLASS[level]}>
          {renderInline(heading[2], `t${key}`)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // GFM table
    if (line.trim().startsWith("|") && SEPARATOR.test(lines[i + 1] ?? "")) {
      flushParagraph(paragraph);
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const tableKey = key++;
      blocks.push(
        <ScrollShell key={`tb${tableKey}`}>
          <div className="rounded-md border border-line">
            <table className="w-full min-w-max border-collapse text-left text-[13px]">
              <thead className="bg-brand-blue-50">
                <tr>
                  {header.map((cell, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-blue-700"
                    >
                      {renderInline(cell, `th${tableKey}-${index}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-line-soft last:border-b-0 odd:bg-surface even:bg-canvas/60"
                  >
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top text-ink">
                        {renderInline(cell, `td${tableKey}-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollShell>,
      );
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraph);
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`q${key++}`}
          className="border-l-2 border-brand-blue-200 bg-brand-blue-50/50 px-3 py-2 text-sm leading-relaxed text-ink-soft"
        >
          {renderInline(body.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // Lists
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph(paragraph);
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const match = isOrdered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
          : /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      const listKey = key++;
      const className =
        "ml-5 flex list-outside flex-col gap-1 text-sm leading-relaxed text-ink-soft " +
        (isOrdered ? "list-decimal" : "list-disc");
      blocks.push(
        isOrdered ? (
          <ol key={`l${listKey}`} className={className}>
            {items.map((item, index) => (
              <li key={index}>{renderInline(item, `li${listKey}-${index}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={`l${listKey}`} className={className}>
            {items.map((item, index) => (
              <li key={index}>{renderInline(item, `li${listKey}-${index}`)}</li>
            ))}
          </ul>
        ),
      );
      continue;
    }

    // Blank line ends a paragraph
    if (line.trim() === "") {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flushParagraph(paragraph);

  if (blocks.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-ink-faint">
        File markdown tồn tại nhưng rỗng.
      </p>
    );
  }

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
