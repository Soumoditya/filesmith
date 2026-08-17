/**
 * Carries files from the homepage drop zone to the tool the user picks.
 *
 * A module-level slot rather than router state or context: File objects
 * can't be serialised into history state, and the handoff is a one-shot
 * event that no component needs to re-render on.
 */

let pending: File[] | null = null;

export function stageFiles(files: File[]): void {
  pending = files.length > 0 ? files : null;
}

/** Returns the staged files exactly once, then forgets them. */
export function claimFiles(): File[] | null {
  const files = pending;
  pending = null;
  return files;
}

export function clearStagedFiles(): void {
  pending = null;
}
