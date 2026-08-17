import { ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HUBS, type ToolDef } from "../lib/registry";
import { Notice } from "./ui";

/**
 * Every tool page wears this: breadcrumb, title, the privacy line, then the
 * tool's own UI. Learn one tool and you know your way around all of them.
 */
export function ToolShell({
  tool,
  caveat,
  wide = false,
  children,
}: {
  tool: ToolDef;
  /** An honest note about what this tool can't do well. Shown under the title. */
  caveat?: ReactNode;
  /**
   * Builders that put an editor beside a live preview need more room than a
   * single-input tool; 3xl squeezes the form to about 380px.
   */
  wide?: boolean;
  children: ReactNode;
}) {
  const hub = HUBS.find((h) => h.id === tool.hub);

  useEffect(() => {
    document.title = `${tool.name} — Filesmith`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", tool.blurb);
    return () => {
      document.title = "Filesmith — Every file tool. Free. In your browser.";
    };
  }, [tool]);

  return (
    <div
      className={
        wide
          ? "mx-auto max-w-7xl px-4 pt-8 pb-4 sm:px-6"
          : "mx-auto max-w-3xl px-4 pt-8 pb-4 sm:px-6"
      }
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link to="/" className="transition-colors hover:text-ink">
          Home
        </Link>
        <ChevronRight className="size-3.5 text-faint" aria-hidden />
        {hub && (
          <>
            <Link to={`/${hub.id}`} className="transition-colors hover:text-ink">
              {hub.name}
            </Link>
            <ChevronRight className="size-3.5 text-faint" aria-hidden />
          </>
        )}
        <span className="truncate text-ink">{tool.name}</span>
      </nav>

      <header className="mt-5">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {tool.name}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted">{tool.blurb}</p>
      </header>

      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <ShieldCheck className="size-4 shrink-0 text-positive" aria-hidden />
        This runs entirely on your device. Nothing is uploaded.
      </p>

      {caveat && (
        <Notice tone="warning" className="mt-5">
          {caveat}
        </Notice>
      )}

      <div className="mt-8">{children}</div>
    </div>
  );
}
