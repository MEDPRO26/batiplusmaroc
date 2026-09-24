import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

/** Left-aligned logo bar for signup / multi-step auth pages. */
export async function AuthTopBar() {
  const tBrand = await getTranslations("brand");

  return (
    <div className="flex items-center px-5 py-5 sm:px-8 lg:px-10">
      <Link
        aria-label={tBrand("homeAria")}
        className="inline-flex text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        href={routes.home}
      >
        <BrandLogo className="text-[1.55rem] leading-none text-ink" name={tBrand("name")} />
      </Link>
    </div>
  );
}
