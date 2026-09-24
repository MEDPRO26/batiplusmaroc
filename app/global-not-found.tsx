import type { Metadata } from "next";
import { GlobalNotFoundDocument } from "@/components/layout/global-not-found-document";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 | Batiplus",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return <GlobalNotFoundDocument />;
}
