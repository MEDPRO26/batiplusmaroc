import { getTranslations } from "next-intl/server";

export default async function SeoLoading() {
  const t = await getTranslations("seoCms");
  return <div aria-busy="true" className="mx-auto w-full max-w-[1500px] space-y-4" role="status"><span className="sr-only">{t("loading")}</span><div className="h-12 w-72 animate-pulse rounded-xl bg-white"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div className="h-32 animate-pulse rounded-[20px] bg-white" key={index}/>)}</div></div>;
}
