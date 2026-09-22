import { joinClassNames } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={joinClassNames("skeleton-block rounded-md", className)} />;
}
