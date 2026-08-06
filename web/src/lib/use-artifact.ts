"use client";

import { useEffect, useState } from "react";
import type { ArtifactResult, LoadState } from "./api";

type Entry<T> = { load: () => Promise<ArtifactResult<T>>; state: ArtifactResult<T> };

/**
 * Load one artifact through `src/lib/api.ts`.
 *
 * `load` must be a stable reference — either a module-level fetcher
 * (`getPipelineSpec`) or a `useCallback`-wrapped closure for the
 * parameterised ones (`() => getMetrics(state)`).
 *
 * The result is tagged with the loader that produced it, so switching loaders
 * reports `loading` by derivation instead of by a synchronous setState inside
 * the effect.
 */
export function useArtifact<T>(
  load: () => Promise<ArtifactResult<T>>,
): LoadState<T> {
  const [entry, setEntry] = useState<Entry<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (result) => {
        if (!cancelled) setEntry({ load, state: result });
      },
      (error: unknown) => {
        if (cancelled) return;
        setEntry({
          load,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (entry === null || entry.load !== load) return { status: "loading" };
  return entry.state;
}
