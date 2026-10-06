"use client";

import { Building2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps, type ReactNode } from "react";
import { isApprovedCompanyCoverUrl } from "@/lib/files/company-cover";

type Props = Omit<ComponentProps<typeof Image>, "src" | "alt" | "unoptimized" | "onError"> & {
  url: string | null | undefined;
  alt: string;
  fallback?: ReactNode;
};

/** Approval/visibility remain authoritative in Convex; never optimize, proxy or fall back to legacy covers. */
export function ApprovedCompanyCover({ url, alt, fallback, ...props }: Props) {
  const t = useTranslations("companyCover");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!isApprovedCompanyCoverUrl(url) || failedUrl === url) {
    return fallback ?? <span aria-label={t("genericAlt")} className="grid size-full place-items-center text-brand" role="img"><Building2 aria-hidden className="size-1/2" /></span>;
  }
  return <Image {...props} alt={alt} onError={() => setFailedUrl(url)} src={url} unoptimized />;
}
