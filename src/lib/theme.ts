import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const STORAGE_KEY = "filesmith:theme";

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Private-mode browsers throw on localStorage. Not worth failing over.
  }
  return "system";
}

/**
 * "system" removes the attribute entirely so the CSS media query takes over,
 * which keeps the stylesheet as the single source of truth for the palette.
 */
function apply(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

/** Runs before React mounts so there's no flash of the wrong theme. */
export function initTheme(): void {
  apply(readStored());
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readStored);

  useEffect(() => {
    apply(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Ignore — the theme still applies for this session.
    }
  }, [pref]);

  /** Cycles light -> dark -> system. */
  const cycle = useCallback(() => {
    setPref((p) => (p === "light" ? "dark" : p === "dark" ? "system" : "light"));
  }, []);

  return { pref, setPref, cycle };
}
