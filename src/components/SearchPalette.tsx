import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { HUBS, searchTools, TOOLS } from "../lib/registry";
import { Badge } from "./ui";

/** Ctrl/Cmd-K search over the whole tool catalogue. */
export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    // With no query, show the tools that already work — a useful default
    // rather than an empty box.
    const list = query.trim()
      ? searchTools(query)
      : TOOLS.filter((t) => t.status === "ready");
    return list.slice(0, 8);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after paint, otherwise the dialog isn't in the DOM yet.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const go = (index: number) => {
    const tool = results[index];
    if (!tool || tool.status !== "ready") return;
    onClose();
    navigate(`/t/${tool.slug}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
    >
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-xl overflow-hidden rounded-card border border-line bg-surface shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(active);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you need to do?"
            className="h-13 flex-1 bg-transparent py-4 text-[0.9375rem] text-ink outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-faint transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((tool, i) => {
              const hub = HUBS.find((h) => h.id === tool.hub);
              const ready = tool.status === "ready";
              return (
                <li key={tool.slug}>
                  <button
                    type="button"
                    disabled={!ready}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(i)}
                    className={clsx(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      i === active && ready && "bg-sunken",
                      !ready && "cursor-default opacity-55",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {tool.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {tool.blurb}
                      </span>
                    </span>
                    {ready ? (
                      <span className="shrink-0 text-xs text-faint">{hub?.name}</span>
                    ) : (
                      <Badge>Soon</Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
