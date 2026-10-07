"use client";

import { useTranslations } from "next-intl";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useSafeSignOut } from "@/features/auth/hooks/use-safe-sign-out";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function OnboardingChrome({
  progressLabel,
  progressValue,
  showProgress = true,
}: {
  progressLabel: string;
  progressValue: number;
  /** Screens that draw their own progress bar (the project wizard footer) hide this one. */
  showProgress?: boolean;
}) {
  const tBrand = useTranslations("brand");
  const tAuth = useTranslations("auth");
  const signOut = useSafeSignOut();
  const router = useRouter();
  const clamped = Math.min(100, Math.max(0, progressValue));

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border/80 bg-white">
      <div className="mx-auto flex min-h-14 w-full max-w-[1120px] items-center justify-between gap-4 px-5 sm:min-h-16 sm:px-8">
        <Link
          aria-label={tBrand("homeAria")}
          className="inline-flex text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          href={routes.home}
        >
          <BrandLogo className="text-[1.4rem] leading-none" name={tBrand("name")} />
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <LanguageSwitcher />
          <button
            className="cursor-pointer border-0 bg-transparent p-0 text-[0.88rem] font-medium text-ink/70 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            onClick={() => {
              void signOut().then((signedOut) => {
                if (signedOut) router.push(routes.signIn);
              });
            }}
            type="button"
          >
            {tAuth("signOut")}
          </button>
        </div>
      </div>
      {showProgress ? <div
        aria-label={progressLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={clamped}
        className="h-1 w-full bg-[#e8eef2]"
        role="progressbar"
      >
        <div className="h-full bg-brand transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${clamped}%` }} />
      </div> : null}
    </header>
  );
}
