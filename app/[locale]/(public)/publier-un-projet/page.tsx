import { redirect } from "next/navigation";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.postProject, "postProject");
}

export default async function PostProjectPage({ params }: Props) {
  const locale = await resolveLocale(params);
  redirect(locale === "en" ? "/en/client/projects/new" : "/fr/espace-client/projets/nouveau");
}
