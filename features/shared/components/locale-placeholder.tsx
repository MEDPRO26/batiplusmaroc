import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProjectDiscoveryEmptyState } from "@/features/projects/components/project-discovery-empty-state";
import { EmptyState } from "@/features/shared/components/error-state";
import { Link } from "@/i18n/navigation";
import type { AppPathname } from "@/lib/i18n-seo";
import { resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

export async function LocalePlaceholder({
  params,
  titleKey,
  leadKey,
  namespace,
}: {
  params: Promise<{ locale: string }>;
  titleKey: "post" | "browseTitle" | "directoryTitle" | "profile" | "signIn" | "signUp";
  leadKey: "empty" | "browseLead" | "directoryLead" | "signInLead" | "signUpLead";
  namespace: "project" | "company" | "auth";
}) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations(namespace);
  const tCommon = await getTranslations("common");
  const tNav = await getTranslations("nav");
  const tUx = await getTranslations("ux");
  const emptyKind = namespace === "project" ? "projects" : namespace === "company" ? "companies" : null;

  return (
    <section className="mx-auto w-[calc(100%-36px)] max-w-[1280px] py-20 sm:w-[calc(100%-48px)] sm:py-24 lg:w-[calc(100%-64px)] lg:py-28">
      <p className="mb-4 text-[0.7rem] font-bold tracking-[0.18em] text-brand uppercase">{tCommon("comingSoon")}</p>
      <h1 className="m-0 max-w-4xl text-[clamp(2.2rem,5vw,4.6rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-ink">{t(titleKey as never)}</h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">{t(leadKey as never)}</p>
      {emptyKind === "projects" ? (
        <ProjectDiscoveryEmptyState />
      ) : emptyKind ? (
        <EmptyState
          actionHref={routes.contact}
          actionLabel={tUx(`empty.${emptyKind}.action`)}
          className="mt-10 max-w-2xl"
          title={tUx(`empty.${emptyKind}.title`)}
        />
      ) : (
        <div className="mt-10 flex flex-wrap gap-3">
          <Link className="button button-primary" href={routes.home}>
            {tNav("home")}
          </Link>
          <Link className="button border border-brand-border bg-white text-ink" href={routes.contact}>
            {tNav("contact")}
          </Link>
        </div>
      )}
    </section>
  );
}

export type MarketplaceHref = AppPathname;
