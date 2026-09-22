import { Skeleton } from "@/components/ui/skeleton";

export function CompanyDirectorySkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" aria-live="polite" className="bg-[#f7f9fb]" role="status">
      <span className="sr-only">{label}</span>
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-7 w-[min(100%,28rem)]" />
          <Skeleton className="mt-2 h-4 w-[min(100%,36rem)]" />
          <Skeleton className="mt-5 h-11 w-full max-w-[640px] rounded-full" />
        </div>
      </div>
      <div className="mx-auto grid w-[calc(100%-36px)] max-w-[1120px] gap-8 py-8 sm:w-[calc(100%-48px)] lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="border-t border-[#e4eaf0]">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="border-b border-[#e4eaf0]" key={index}>
              <CompanyDiscoveryCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CompanyDiscoveryCardSkeleton() {
  return (
    <div className="-mx-2 flex gap-4 rounded-xl px-2 py-6 sm:-mx-3 sm:gap-5 sm:px-3">
      <Skeleton className="size-12 shrink-0 rounded-full sm:size-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-44 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-36 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24 shrink-0 rounded-full sm:w-28" />
        </div>
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-4/5" />
        <div className="mt-3.5 flex gap-2">
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
