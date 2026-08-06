import { ScrollShell } from "./ui";

/**
 * Fallback renderer for JSON whose shape the FE does not (yet) know — used for
 * `data/quality/*` output while the Python side is still settling those shapes.
 * Renders whatever is actually in the file; never fills in absent keys.
 */
export function GenericJson({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-ink-faint">null</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-ink-faint">Mảng rỗng.</p>;
    }
    return (
      <ol className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li key={index} className="rounded-md border border-line bg-canvas px-3 py-2">
            <span className="mb-1 block font-mono text-[11px] text-ink-faint">
              [{index}]
            </span>
            <GenericJson value={item} />
          </li>
        ))}
      </ol>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <p className="text-sm text-ink-faint">Object rỗng.</p>;
    }
    return (
      <ScrollShell>
        <table className="w-full min-w-max border-collapse text-left text-[13px]">
          <tbody>
            {entries.map(([key, entryValue]) => (
              <tr key={key} className="border-b border-line-soft last:border-b-0">
                <th
                  scope="row"
                  className="whitespace-nowrap py-1.5 pr-4 align-top font-mono text-[12px] font-medium text-brand-blue-700"
                >
                  {key}
                </th>
                <td className="break-anywhere min-w-0 py-1.5 align-top text-ink">
                  <Scalar value={entryValue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollShell>
    );
  }

  return <Scalar value={value} />;
}

function Scalar({ value }: { value: unknown }) {
  if (value === null) return <span className="font-mono text-ink-faint">null</span>;
  if (typeof value === "boolean") {
    return (
      <span
        className={`font-mono font-semibold ${value ? "text-ok" : "text-brand-red-700"}`}
      >
        {String(value)}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono tabular-nums">{value}</span>;
  }
  if (typeof value === "string") {
    return <span className="break-anywhere">{value}</span>;
  }
  return (
    <pre className="scroll-shell max-h-64 overflow-auto rounded border border-line bg-canvas p-2 font-mono text-[11.5px] text-ink">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}
