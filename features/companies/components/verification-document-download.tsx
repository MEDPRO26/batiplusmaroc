"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { downloadVerificationFile } from "@/lib/files/company-verification";
import { mapAppError } from "@/lib/errors/map-app-error";

export function VerificationDocumentDownload({ url, fileName, label, className }: {
  url: string; fileName: string; label: string; className: string;
}) {
  const token = useAuthToken();
  const tUx = useTranslations("ux");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <span>
    <button className={className} disabled={busy} type="button" onClick={async () => {
      setError(null); setBusy(true);
      try { await downloadVerificationFile(url, token, fileName); }
      catch (caught) { setError(mapAppError(caught, tUx)); }
      finally { setBusy(false); }
    }}>{label}</button>
    {error ? <span className="mt-1 block text-xs text-red-700" role="alert">{error}</span> : null}
  </span>;
}
