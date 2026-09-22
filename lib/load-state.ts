export type QueryPresentation = "loading" | "empty" | "ready";

export function presentationForQuery<T>(
  value: T | undefined | null,
  isEmpty: (value: T) => boolean = (item) => Array.isArray(item) && item.length === 0,
): QueryPresentation {
  if (value === undefined) return "loading";
  if (value === null || isEmpty(value)) return "empty";
  return "ready";
}
