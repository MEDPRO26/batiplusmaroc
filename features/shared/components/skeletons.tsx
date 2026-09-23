import { Skeleton } from "@/components/ui/skeleton";
import { joinClassNames } from "@/lib/utils";

export function PageSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className={joinClassNames("mx-auto w-full max-w-[1280px] px-[18px] py-16 sm:px-6 lg:px-8", className)}
      role="status"
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-5 h-12 w-[min(100%,28rem)]" />
      <Skeleton className="mt-4 h-5 w-[min(100%,40rem)]" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton className="hidden sm:block" />
        <CardSkeleton className="hidden lg:block" />
      </div>
    </section>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={joinClassNames("rounded-2xl border border-brand-border bg-white p-5", className)}>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="mt-4 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-5 h-10 w-28 rounded-full" />
    </div>
  );
}

export function CompanyCardSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4 sm:p-5">
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="mt-4 h-5 w-2/3" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="mt-5 h-10 w-full rounded-full" />
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-6 w-4/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-2/3" />
      <div className="mt-5 flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
    </div>
  );
}

export function ProposalCardSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-5 h-10 w-32 rounded-full" />
    </div>
  );
}

export function TableListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
      <div className="grid grid-cols-4 gap-3 border-b border-brand-border px-4 py-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12 justify-self-end" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div className="grid grid-cols-4 gap-3 border-b border-brand-border px-4 py-4 last:border-b-0" key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-10 justify-self-end" />
        </div>
      ))}
    </div>
  );
}

export function ProfileSectionSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-5 sm:p-7">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>
      <Skeleton className="mt-6 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
    </div>
  );
}

export function FormSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-4" role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}

export function MessageThreadSkeleton() {
  return (
    <div className="grid gap-4 rounded-2xl border border-brand-border bg-white p-4 sm:p-6">
      <div className="flex justify-start">
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
      </div>
    </div>
  );
}

export function PortfolioGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="hidden aspect-[4/3] w-full rounded-xl sm:block" />
    </div>
  );
}

export function DashboardCardsSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="mx-auto w-full max-w-[1120px] px-[18px] py-10 sm:px-6 lg:px-8" role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-5 h-12 w-[min(100%,28rem)]" />
      <Skeleton className="mt-4 h-5 w-[min(100%,38rem)]" />
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton className="hidden lg:block" />
      </div>
    </section>
  );
}
