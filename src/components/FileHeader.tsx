import { FileText, X } from "lucide-react";
import type { ReactNode } from "react";
import { formatBytes } from "../lib/files";
import { Button, Card } from "./ui";

/** The loaded-file strip that sits at the top of every single-file tool. */
export function FileHeader({
  file,
  detail,
  onClear,
  disabled,
}: {
  file: File;
  detail?: ReactNode;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-3 sm:px-4">
      <FileText className="size-4 shrink-0 text-faint" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{file.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {formatBytes(file.size)}
          {detail ? <> · {detail}</> : null}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={disabled}
        aria-label="Choose a different file"
      >
        <X className="size-4" aria-hidden />
        <span className="hidden sm:inline">Change</span>
      </Button>
    </Card>
  );
}
