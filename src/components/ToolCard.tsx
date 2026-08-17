import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ToolDef } from "../lib/registry";
import { Badge } from "./ui";

export function ToolCard({ tool, className }: { tool: ToolDef; className?: string }) {
  const ready = tool.status === "ready";

  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="text-[0.9375rem] font-semibold text-ink">{tool.name}</span>
        {ready ? (
          <ArrowRight
            className="mt-0.5 size-4 shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
            aria-hidden
          />
        ) : (
          <Badge>Soon</Badge>
        )}
      </span>
      <span className="mt-1.5 block text-sm leading-relaxed text-muted">
        {tool.blurb}
      </span>
    </>
  );

  const shared = clsx(
    "group flex flex-col rounded-card border p-4 text-left transition-colors",
    className,
  );

  if (!ready) {
    return (
      <div
        className={clsx(shared, "cursor-default border-line bg-surface opacity-60")}
        aria-disabled
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/t/${tool.slug}`}
      className={clsx(shared, "border-line bg-surface hover:border-accent hover:bg-accent-wash")}
    >
      {body}
    </Link>
  );
}
