import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function WhyUs() {
  const t = await getTranslations("home.whyUs");
  const points = ["0", "1", "2", "3", "4"] as const;

  return (
    <section className="section why-us">
      <div className="container-shell why-grid">
        <div className="why-copy">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
          <p>{t("description")}</p>
          <ul>
            {points.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {t(`points.${point}`)}
              </li>
            ))}
          </ul>
          <Link className="button button-primary" href={routes.contact}>
            {t("cta")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="why-media">
          <Image src="/images/service-construction.png" alt={t("imageAlt")} fill sizes="(max-width: 767px) 100vw, 50vw" />
        </div>
      </div>
    </section>
  );
}
