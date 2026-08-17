import clsx from "clsx";

/**
 * The Filesmith mark: an anvil. Solid fill, no strokes, so it stays legible
 * when it's shrunk to a 16px favicon.
 */
export function AnvilMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={clsx("shrink-0", className)}
    >
      <path d="M1.8 8.15 A0.6 0.6 0 0 1 2.05 7.2 L6.4 5.35 A2.4 2.4 0 0 1 7.35 5.15 H19.6 A1.6 1.6 0 0 1 21.2 6.75 V8.9 A1.6 1.6 0 0 1 19.6 10.5 H14.55 L15.5 14.15 H17.3 A2.2 2.2 0 0 1 19.5 16.35 V18.85 H4.5 V16.35 A2.2 2.2 0 0 1 6.7 14.15 H8.5 L9.45 10.5 H6.6 A2.4 2.4 0 0 1 5.2 10.05 Z" />
    </svg>
  );
}

/** Full lockup: mark + wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <AnvilMark className="size-6 text-accent" />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-ink">
        Filesmith
      </span>
    </span>
  );
}
