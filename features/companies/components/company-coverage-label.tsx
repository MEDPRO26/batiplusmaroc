import type { useTranslations } from "next-intl";
import { presentCoverageScopes, type CoverageScopePresentation } from "@/lib/geography/coverage-labels";

type CoverageTranslator = ReturnType<typeof useTranslations<"companyDirectory.coverage">>;

/** Shared public display of explicit declarations, with native keyboard disclosure. */
export function CompanyCoverageLabel({ keys, locale, t, showLabel = true }: {
  keys: readonly string[] | undefined;
  locale: "fr" | "en";
  t: CoverageTranslator;
  showLabel?: boolean;
}) {
  const items = presentCoverageScopes(keys, locale);
  if (items.length === 0) {
    return <p className="mt-1 mb-0 break-words text-sm leading-5 text-muted">{t("notDeclared")}</p>;
  }
  const visible = items.slice(0, 2).map((item) => coverageItemText(item, t, locale));
  const hidden = items.length - visible.length;
  const summary = (
    <>
      {showLabel ? <span className="font-medium text-ink">{t("label")}: </span> : null}
      {visible.join(", ")}
      {hidden > 0 ? <span> · {t("more", { count: hidden })}</span> : null}
    </>
  );
  if (items.length <= 2) {
    return <p className="mt-1 mb-0 break-words text-sm leading-5 text-muted">{summary}</p>;
  }
  return (
    <details className="mt-1 break-words text-sm leading-5 text-muted">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {summary}
      </summary>
      <ul className="mt-2 grid list-disc gap-1 pl-5">
        {items.map((item) => <li key={item.key}>{coverageItemText(item, t, locale)}</li>)}
      </ul>
    </details>
  );
}

function coverageItemText(
  item: CoverageScopePresentation,
  t: CoverageTranslator,
  locale: "fr" | "en",
) {
  if (item.kind === "national") return t("national");
  const name = item.name ?? "";
  if (item.kind === "region") return t("region", { name });
  const elided = locale === "fr" && /^[aeiouàâäéèêëîïôöùûüyh]/i.test(name);
  if (item.kind === "prefecture") return t(elided ? "prefectureElided" : "prefecture", { name });
  return t(elided ? "provinceElided" : "province", { name });
}
