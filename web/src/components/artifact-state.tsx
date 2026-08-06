import type { ReactNode } from "react";
import type { LoadState } from "@/lib/api";
import { CommandBlock } from "./ui";

/**
 * Empty state for an artifact the pipeline has not produced yet.
 *
 * This is the *expected* view for most artifacts right now, so it names the
 * exact file that is missing and the exact command that creates it. It never
 * substitutes sample data.
 */
export function MissingArtifact({
  path,
  hint,
  label,
}: {
  path: string;
  hint: string;
  label?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-brand-blue-200 bg-brand-blue-50/60 px-5 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-brand-blue-200 bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">
          Chưa có artifact
        </span>
        {label ? (
          <span className="text-sm font-medium text-ink">{label}</span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Pipeline chưa sinh ra file này. Không có dữ liệu mẫu nào được hiển thị thay thế —
        mọi con số trên trang đều phải đọc từ artifact thật.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          File thiếu
        </dt>
        <dd className="break-anywhere min-w-0 font-mono text-[13px] text-ink">{path}</dd>

        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Chạy lệnh
        </dt>
        <dd className="min-w-0">
          {hint ? (
            <CommandBlock command={hint} />
          ) : (
            <span className="text-sm text-ink-soft">
              Không có lệnh nào được khai báo cho artifact này.
            </span>
          )}
          <span className="mt-1.5 block text-xs text-ink-faint">
            Chạy từ thư mục gốc của repo, sau đó tải lại trang.
          </span>
        </dd>
      </dl>
    </div>
  );
}

export function ArtifactError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-brand-red-200 bg-brand-red-50 px-5 py-4">
      <p className="text-sm font-semibold text-brand-red-700">
        Không đọc được artifact
      </p>
      <p className="break-anywhere mt-1 font-mono text-[12.5px] leading-relaxed text-ink-soft">
        {message}
      </p>
    </div>
  );
}

export function ArtifactLoading({ label }: { label?: string }) {
  return (
    <div
      className="rounded-lg border border-line bg-canvas px-5 py-5"
      aria-busy="true"
    >
      <p className="text-sm text-ink-faint">
        {label ? `Đang đọc ${label}…` : "Đang đọc artifact…"}
      </p>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-2/3 rounded bg-line" />
        <div className="h-2.5 w-1/2 rounded bg-line-soft" />
        <div className="h-2.5 w-5/6 rounded bg-line-soft" />
      </div>
    </div>
  );
}

/**
 * Render-prop boundary: shows loading / missing / error states and hands the
 * parsed artifact to `children` only when it really exists on disk.
 */
export function ArtifactBoundary<T>({
  state,
  label,
  children,
}: {
  state: LoadState<T>;
  label?: string;
  children: (data: T, path?: string) => ReactNode;
}) {
  if (state.status === "loading") return <ArtifactLoading label={label} />;
  if (state.status === "missing")
    return <MissingArtifact path={state.path} hint={state.hint} label={label} />;
  if (state.status === "error") return <ArtifactError message={state.message} />;
  return <>{children(state.data, state.path)}</>;
}
