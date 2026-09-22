import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function AuthFooter() {
  const t = await getTranslations("auth.signInFlow");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-dark-section px-5 py-4 text-white sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-center text-[0.78rem] text-white/70 sm:flex-row sm:text-start">
        <p className="mb-0">{t("copyright", { year })}</p>
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-5 gap-y-2 p-0">
          <li>
            <Link className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.terms}>
              {t("footerTerms")}
            </Link>
          </li>
          <li>
            <Link className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.privacy}>
              {t("footerPrivacy")}
            </Link>
          </li>
          <li>
            <Link className="hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.contact}>
              {t("footerContact")}
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
