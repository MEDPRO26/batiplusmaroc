"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const SEO_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";
export const SEO_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export function useSeoMediaUpload() {
  const requestUpload = useAction(api.seo.media.requestSeoMediaUpload);
  const verifyUpload = useAction(api.seo.media.verifySeoMediaUpload);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File, replacesMediaId?: Id<"seoMedia">) {
    setUploading(true);
    try {
      const intent = await requestUpload({
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        replacesMediaId,
      });
      const response = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("SEO_MEDIA_DIRECT_UPLOAD_FAILED");
      return await verifyUpload({ uploadToken: intent.uploadToken });
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}
