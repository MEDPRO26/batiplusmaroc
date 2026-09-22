import { getTranslations } from "next-intl/server";
import { OAuthRoleFinalizer } from "@/features/auth/components/oauth-role-finalizer";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export async function SignUpRoleSelection() {
  const t = await getTranslations("auth.signUpFlow");

  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
      <div className="w-full text-center">
        <h1 className="m-0 text-[clamp(1.85rem,4vw,2.75rem)] font-semibold tracking-[-0.04em] text-ink">
          {t("welcomeTitle")}
        </h1>
        <p className="mt-3 mb-0 text-[1.05rem] text-muted sm:text-[1.15rem]">{t("welcomeQuestion")}</p>
      </div>

      <OAuthRoleFinalizer />

      <div className="mt-10 grid w-full gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5">
        <RoleCard
          href={routes.signUpClient}
          title={t("clientTitle")}
          description={t("clientDescription")}
          icon={<ClientIcon />}
        />
        <RoleCard
          href={routes.signUpCompany}
          title={t("companyTitle")}
          description={t("companyDescription")}
          icon={<CompanyIcon />}
        />
      </div>

      <p className="mt-auto pt-14 text-center text-[0.95rem] text-muted">
        {t("alreadyHaveAccount")}{" "}
        <Link
          className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          href={routes.signIn}
        >
          {t("logIn")}
        </Link>
      </p>
    </section>
  );
}

function RoleCard({
  href,
  title,
  description,
  icon,
}: {
  href: typeof routes.signUpClient | typeof routes.signUpCompany;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      className="group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl border border-brand-border bg-[linear-gradient(145deg,#eef6fb_0%,#f7faf8_48%,#f3f6e8_100%)] p-6 shadow-[0_1px_0_rgb(23_61_99/0.04)] transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_16px_40px_rgb(5_79_132/0.12)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:min-h-[260px] sm:p-7"
      href={href}
    >
      <div className="mb-auto flex justify-center pt-4 text-ink sm:pt-6">{icon}</div>
      <p className="mb-1.5 text-[1.2rem] font-semibold tracking-[-0.03em] text-ink">
        {title}
        <span aria-hidden="true" className="ms-1.5 inline-block transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </p>
      <p className="mb-0 text-[0.92rem] leading-6 text-muted">{description}</p>
    </Link>
  );
}

function ClientIcon() {
  return (
    <svg aria-hidden="true" className="size-16 sm:size-[4.5rem]" fill="none" viewBox="0 0 72 72">
      <circle cx="28" cy="24" r="10" stroke="currentColor" strokeWidth="2.25" />
      <path
        d="M12 54c2.8-9 9.2-14 16-14s13.2 5 16 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
      <rect
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2.25"
        width="22"
        x="40"
        y="34"
      />
      <path d="M47 34v-3a4 4 0 0 1 8 0v3" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
    </svg>
  );
}

function CompanyIcon() {
  return (
    <svg aria-hidden="true" className="size-16 sm:size-[4.5rem]" fill="none" viewBox="0 0 72 72">
      <circle cx="30" cy="22" r="9" stroke="currentColor" strokeWidth="2.25" />
      <path
        d="M14 52c2.4-8.2 8.2-12.5 16-12.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
      <rect height="20" rx="2" stroke="currentColor" strokeWidth="2.25" width="28" x="30" y="34" />
      <path d="M36 42h16M36 48h10" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
      <path d="M44 34v-4h8v4" stroke="currentColor" strokeLinejoin="round" strokeWidth="2.25" />
    </svg>
  );
}
