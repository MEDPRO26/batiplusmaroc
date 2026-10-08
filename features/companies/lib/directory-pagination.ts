export const DIRECTORY_AUTOMATIC_PAGE_LIMIT = 4;

export type DirectoryPageStatus = "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted" | "Error";

/**
 * Advance only while the backend can continue and the latest page added no
 * Companies. Growth resets the caller's counter. The limit stops an empty
 * streak from requesting forever.
 */
export function directoryAutomaticAdvance(input: {
  status: DirectoryPageStatus;
  visibleCount: number;
  previousVisibleCount: number;
  automaticAdvances: number;
}): boolean {
  if (input.status !== "CanLoadMore") return false;
  if (input.automaticAdvances >= DIRECTORY_AUTOMATIC_PAGE_LIMIT) return false;
  return input.visibleCount <= input.previousVisibleCount;
}
