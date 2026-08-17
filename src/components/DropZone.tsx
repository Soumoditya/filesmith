import clsx from "clsx";
import { UploadCloud } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * The one file input used everywhere — homepage and every tool page.
 * Handles drag-and-drop, click-to-browse and paste.
 */
export function DropZone({
  onFiles,
  accept,
  multiple = false,
  title,
  hint,
  compact = false,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  /** `accept` attribute for the file picker, e.g. ".pdf" or "image/*". */
  accept?: string;
  multiple?: boolean;
  title: string;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element, so a plain boolean
  // flickers. Counting enters and leaves is the reliable fix.
  const depth = useRef(0);

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [multiple, onFiles],
  );

  return (
    <div
      className={clsx("relative", className)}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        if (e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current--;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        emit(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onPaste={(e) => emit(e.clipboardData.files)}
        className={clsx(
          "flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors",
          compact ? "gap-2 px-6 py-8" : "gap-3 px-6 py-14 sm:py-20",
          dragging
            ? "border-accent bg-accent-wash"
            : "border-line-strong bg-surface hover:border-faint hover:bg-sunken",
        )}
      >
        <UploadCloud
          className={clsx(
            "transition-colors",
            compact ? "size-7" : "size-10",
            dragging ? "text-accent" : "text-faint",
          )}
          aria-hidden
        />
        <span
          className={clsx(
            "font-medium text-ink",
            compact ? "text-sm" : "text-base sm:text-lg",
          )}
        >
          {title}
        </span>
        {hint && (
          <span className="max-w-md text-sm leading-relaxed text-muted">{hint}</span>
        )}
        {children}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          emit(e.target.files);
          // Reset so picking the same file twice in a row still fires.
          e.target.value = "";
        }}
      />
    </div>
  );
}
