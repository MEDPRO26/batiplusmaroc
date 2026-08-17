import Link from "next/link";
import { primaryNavigation, serviceNavigation } from "@/content/site";
export function MobileNav() { return <details className="mobile-nav"><summary>Menu</summary><nav aria-label="Navigation mobile">{[...primaryNavigation, ...serviceNavigation].map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav></details>; }
