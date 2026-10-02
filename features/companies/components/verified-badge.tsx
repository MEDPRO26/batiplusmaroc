import { joinClassNames } from "@/lib/utils";

export type VerificationStatus = "draft" | "pending" | "rejected" | "verified";

type VerifiedBadgeProps = { label: string; className?: string } & (
  | { isVerified: boolean; verificationStatus?: never }
  | { verificationStatus: VerificationStatus; isVerified?: never }
);

export function VerifiedGlyph({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={joinClassNames("shrink-0 text-[#2f6bff]", className)} viewBox="0 0 24 24" fill="none">
    <path fill="currentColor" d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
    <path stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" d="m16 9-5.5 5.5L8 12" />
  </svg>;
}

/** Presentation only: the backend derives the flag; callers supply next-intl copy. */
export function VerifiedBadge(props: VerifiedBadgeProps) {
  const verified = props.verificationStatus !== undefined
    ? props.verificationStatus === "verified"
    : props.isVerified === true;
  if (!verified) return null;
  return <span className={joinClassNames("inline-flex max-w-full items-center gap-2 text-sm font-medium leading-5 text-[#4f596a]", props.className)} data-verification="verified">
    <VerifiedGlyph className="size-6" />
    <span className="min-w-0 break-words">{props.label}</span>
  </span>;
}
