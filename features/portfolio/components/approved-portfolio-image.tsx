"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState, type ComponentProps } from "react";
import { isApprovedPortfolioImageUrl } from "@/lib/files/portfolio-image";

type Props = Omit<ComponentProps<typeof Image>, "src" | "unoptimized" | "onError"> & { url: string | null | undefined };

/** Minimal delivery integration: approval-checked bytes bypass the optimizer and have no legacy fallback. */
export function ApprovedPortfolioImage({ url, alt, ...props }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!isApprovedPortfolioImageUrl(url) || failedUrl === url) {
    return <span aria-label={alt || undefined} className="grid size-full place-items-center bg-brand-soft text-brand" role={alt ? "img" : undefined}><ImageIcon aria-hidden className="size-1/3" /></span>;
  }
  return <Image {...props} alt={alt} onError={() => setFailedUrl(url)} src={url} unoptimized />;
}
