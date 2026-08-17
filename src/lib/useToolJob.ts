import { useCallback, useRef, useState } from "react";

/**
 * The state machine every tool shares: idle, working (with progress), then
 * either a result or a readable error.
 *
 * Tools differ in what they produce, so `T` is whatever the operation
 * returns — usually one Blob, sometimes a list of them.
 */

export interface JobState<T> {
  busy: boolean;
  /** 0-100, or null when the work isn't measurable. */
  progress: number | null;
  result: T | null;
  error: string | null;
}

export interface ToolJob<T> extends JobState<T> {
  /** Runs `work`, tracking busy/progress/error. Safe to call repeatedly. */
  run: (
    work: (report: (done: number, total: number) => void) => Promise<T>,
  ) => Promise<void>;
  reset: () => void;
  setError: (message: string) => void;
}

const INITIAL = { busy: false, progress: null, result: null, error: null } as const;

export function useToolJob<T>(): ToolJob<T> {
  const [state, setState] = useState<JobState<T>>(INITIAL);
  // Only the newest run may write to state, so an abandoned job can't
  // overwrite the result of the one the user is actually waiting for.
  const generation = useRef(0);

  const run = useCallback(
    async (work: (report: (done: number, total: number) => void) => Promise<T>) => {
      const mine = ++generation.current;
      setState({ busy: true, progress: null, result: null, error: null });

      const report = (done: number, total: number) => {
        if (generation.current !== mine) return;
        setState((s) => ({ ...s, progress: total > 0 ? (done / total) * 100 : null }));
      };

      try {
        const result = await work(report);
        if (generation.current !== mine) return;
        setState({ busy: false, progress: 100, result, error: null });
      } catch (err) {
        if (generation.current !== mine) return;
        setState({ busy: false, progress: null, result: null, error: describe(err) });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    generation.current++;
    setState(INITIAL);
  }, []);

  const setError = useCallback((message: string) => {
    generation.current++;
    setState({ busy: false, progress: null, result: null, error: message });
  }, []);

  return { ...state, run, reset, setError };
}

/**
 * Turns whatever was thrown into something a non-technical person can act on.
 * Library errors are frequently unhelpful ("Invalid object ref"), so the
 * common causes are matched and translated.
 */
export function describe(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  if (/password/i.test(raw)) {
    return "This file is password protected. Use the “Remove password” tool on it first.";
  }
  if (/encrypt/i.test(raw)) {
    return "This file is encrypted, so it can’t be edited until the protection is removed.";
  }
  if (/out of memory|allocation failed|Array buffer allocation/i.test(raw)) {
    return "Your browser ran out of memory on this file. Try fewer files at once, or a smaller one.";
  }
  if (/Invalid PDF|No PDF header|Failed to parse|Expected instance/i.test(raw)) {
    return "This file couldn’t be read as a PDF. It may be damaged, or it may not really be a PDF.";
  }

  return raw
    ? `Something went wrong: ${raw}`
    : "Something went wrong, and we couldn’t work out what. Try a different file.";
}
