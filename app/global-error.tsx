"use client";

import { useEffect } from "react";
import { logUnexpectedError } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logUnexpectedError(error, { digest: error.digest, source: "global-boundary" });
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: "sans-serif", margin: 0, background: "#f7f9fb", color: "#17191d" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.25rem" }}>
          <p>Une erreur est survenue. Veuillez réessayer.</p>
          <p>Something went wrong. Please try again.</p>
          <button onClick={reset} type="button">
            Réessayer / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
