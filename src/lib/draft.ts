import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a work-in-progress document in the browser so a refresh, a closed
 * tab or a flat battery doesn't lose an hour of typing.
 *
 * Stored locally and never sent anywhere — same as everything else here.
 * Writes are debounced because serialising on every keystroke is wasteful,
 * and localStorage writes are synchronous.
 */

const PREFIX = "filesmith:draft:";

export interface DraftState {
  /** When the draft was last written, or null if nothing is stored yet. */
  savedAt: Date | null;
  /** True between a change and the debounced write landing. */
  pending: boolean;
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: T };
    return parsed.data ?? null;
  } catch {
    // Corrupt or unreadable draft: better to start fresh than to crash.
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Private browsing mode; nothing to clean up.
  }
}

/** Autosaves `value` under `key`, debounced. */
export function useAutosave<T>(key: string, value: T, enabled = true): DraftState {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  // The first render shouldn't count as a change worth saving.
  const primed = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!primed.current) {
      primed.current = true;
      return;
    }

    setPending(true);
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          PREFIX + key,
          JSON.stringify({ savedAt: Date.now(), data: value }),
        );
        setSavedAt(new Date());
      } catch {
        // Quota exceeded or private mode. The tool still works; only the
        // safety net is missing, and the UI reports "not saved".
      } finally {
        setPending(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [key, value, enabled]);

  return { savedAt, pending };
}

/** Human-friendly "how long ago", refreshed as time passes. */
export function useRelativeTime(when: Date | null): string {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!when) return;
    const timer = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(timer);
  }, [when]);

  if (!when) return "";
  const seconds = Math.round((Date.now() - when.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export interface SavedFile<T> {
  /** Guards against loading an invoice into the resume builder. */
  kind: string;
  version: number;
  savedAt: string;
  data: T;
}

/** Serialises a document to a file the user can keep or move to another device. */
export function toSavedFile<T>(kind: string, data: T): Blob {
  const payload: SavedFile<T> = {
    kind,
    version: 1,
    savedAt: new Date().toISOString(),
    data,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

export async function readSavedFile<T>(file: File, expectedKind: string): Promise<T> {
  let parsed: SavedFile<T>;
  try {
    parsed = JSON.parse(await file.text()) as SavedFile<T>;
  } catch {
    throw new Error("That file isn't a saved Filesmith document.");
  }

  if (parsed?.kind !== expectedKind) {
    throw new Error(
      parsed?.kind
        ? `That's a saved ${parsed.kind}, not a ${expectedKind}. Open it in the right tool.`
        : "That file isn't a saved Filesmith document.",
    );
  }
  if (!parsed.data) throw new Error("That saved file looks empty.");

  return parsed.data;
}

/** Stable callback that never goes stale, for use inside timers. */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
