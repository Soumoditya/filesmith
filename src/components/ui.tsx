import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/* -------------------------------------------------------------------------
   Shared primitives. Every tool page is built from these, which is what
   makes fifty tools feel like one product instead of fifty mini-apps.
   ------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover shadow-sm disabled:hover:bg-accent",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-sunken disabled:hover:bg-surface",
  ghost: "text-muted hover:text-ink hover:bg-sunken disabled:hover:bg-transparent",
  danger:
    "bg-surface text-danger border border-line-strong hover:border-danger disabled:hover:border-line-strong",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150 select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "bg-surface border border-line rounded-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Label + optional hint wrapper. Wires up htmlFor/id for you. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

const CONTROL_BASE =
  "w-full rounded-lg border border-line-strong bg-surface text-ink " +
  "placeholder:text-faint transition-colors " +
  "hover:border-faint focus:border-accent " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROL_BASE, "h-10 px-3 text-sm", className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(CONTROL_BASE, "px-3 py-2 text-sm leading-relaxed resize-y", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(CONTROL_BASE, "h-10 px-3 text-sm", className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={clsx("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-accent cursor-pointer"
        {...rest}
      />
      <label htmlFor={id} className="text-sm text-ink cursor-pointer select-none leading-snug">
        {label}
      </label>
    </div>
  );
}

/** Range slider with the current value shown alongside the label. */
export function Slider({
  label,
  value,
  display,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  value: number;
  display?: string;
}) {
  const id = useId();
  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="text-sm tabular-nums text-muted font-mono">
          {display ?? value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        className="w-full accent-accent cursor-pointer"
        {...rest}
      />
    </div>
  );
}

/** Segmented control — better than a <select> for 2-4 exclusive options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={clsx(
        "inline-flex rounded-lg border border-line-strong bg-sunken p-0.5 gap-0.5",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-3 h-8 rounded-md text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "danger" | "positive";

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: "bg-sunken border-line text-muted",
  warning: "bg-sunken border-warning/30 text-warning",
  danger: "bg-sunken border-danger/30 text-danger",
  positive: "bg-sunken border-positive/30 text-positive",
};

export function Notice({
  tone = "info",
  icon,
  children,
  className,
}: {
  tone?: NoticeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed",
        NOTICE_TONES[tone],
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-sunken text-muted border border-line",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={clsx("size-5 animate-spin text-muted", className)}
      aria-label="Working"
    />
  );
}
