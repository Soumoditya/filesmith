import { AlertTriangle } from "lucide-react";
import { Suspense, lazy, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Spinner } from "../components/ui";
import { getTool } from "../lib/registry";

/**
 * Resolves /t/:slug against the registry and lazily mounts the tool.
 * Each tool (and its heavy libraries) is a separate chunk, so opening the
 * homepage never downloads a PDF engine.
 */
export default function ToolRoute() {
  const { slug } = useParams<{ slug: string }>();
  const tool = slug ? getTool(slug) : undefined;

  // Keyed on slug so switching tools creates a fresh lazy component rather
  // than reusing the previous tool's chunk.
  const Tool = useMemo(() => {
    if (!tool?.load) return null;
    return lazy(tool.load);
  }, [tool]);

  if (!tool || !Tool) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <AlertTriangle className="mx-auto size-8 text-faint" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
          {tool ? `${tool.name} isn’t ready yet` : "Tool not found"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {tool
            ? "This one is still being built. It’ll appear here as soon as it works properly — we’d rather ship it late than ship it broken."
            : "That link doesn’t match any tool. It may have been renamed."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-block text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Back to all tools
        </Link>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted">Loading {tool.name}…</p>
        </div>
      }
    >
      <Tool />
    </Suspense>
  );
}
