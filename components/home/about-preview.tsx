import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function AboutPreview() {
  const t = await getTranslations("home.aboutPreview");

  return (
    <section className="section about">
      <div className="container-shell about-grid">
        <div className="about-media">
          <Image src="/images/about-project.jpg" alt={t("imageAlt")} fill sizes="(max-width: 767px) 100vw, 50vw" />
        </div>
        <div className="about-copy">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2>{t("title")}</h2>
          <p>{t("p1")}</p>
          <p>{t("p2")}</p>
          <ul className="check-list">
            <li>{t("items.0")}</li>
            <li>{t("items.1")}</li>
            <li>{t("items.2")}</li>
          </ul>
          <Link className="text-link" href={routes.about}>
            {t("cta")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
