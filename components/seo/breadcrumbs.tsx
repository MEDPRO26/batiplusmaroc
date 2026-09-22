import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppRoute } from "@/lib/routes";

export async function Breadcrumbs({ items }: { items: Array<{ label: string; href: AppRoute }> }) {
  const t = await getTranslations("breadcrumbs");

  return (
    <nav aria-label={t("label")}>
      <ol>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
