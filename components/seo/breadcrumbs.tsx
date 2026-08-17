import Link from "next/link";
import type { ProtectedRoute } from "@/lib/routes";
export function Breadcrumbs({ items }: { items: Array<{ label: string; href: ProtectedRoute }> }) { return <nav aria-label="Fil d’Ariane"><ol>{items.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ol></nav>; }
