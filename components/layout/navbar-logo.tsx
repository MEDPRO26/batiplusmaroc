import { BrandLogo } from "@/components/layout/brand-logo";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function NavbarLogo({
  name,
  homeAria,
  inverted = false,
}: {
  name: string;
  homeAria: string;
  inverted?: boolean;
}) {
  return (
    <Link
      aria-label={homeAria}
      className={`inline-flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${
        inverted ? "text-white" : "text-brand"
      }`}
      href={routes.home}
    >
      <BrandLogo
        className={inverted ? "text-[1.45rem] leading-none text-white" : "text-[1.55rem] leading-none"}
        name={name}
      />
    </Link>
  );
}
