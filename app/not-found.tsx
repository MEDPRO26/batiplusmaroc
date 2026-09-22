import Link from "next/link";

export default function RootNotFound() {
  return (
    <html lang="fr">
      <body>
        <p>Cette page n’est pas sur le plan. / This page is not on the plan.</p>
        <p>
          <Link href="/fr/">FR</Link>
          {" | "}
          <Link href="/en/">EN</Link>
        </p>
      </body>
    </html>
  );
}
