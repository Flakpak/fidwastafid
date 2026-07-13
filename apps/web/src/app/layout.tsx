import type { Metadata } from "next";
import { Scheherazade_New } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "../lib/siteUrl.js";

const scheherazade = Scheherazade_New({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-scheherazade",
});

const DEFAULT_DESCRIPTION = "Les meilleurs bons plans et promotions au Maroc, votés par la communauté.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Fidwastafid", template: "%s — Fidwastafid" },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: "Fidwastafid",
    locale: "fr_MA",
    type: "website",
    title: "Fidwastafid",
    description: DEFAULT_DESCRIPTION,
  },
  // Pas de title/description ici : Next les retombe sur openGraph.* de la
  // page courante quand ils ne sont pas fixés explicitement — ainsi les
  // cartes Twitter reflètent le titre/description par page, pas un texte
  // générique figé.
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={scheherazade.variable}>
      <body>{children}</body>
    </html>
  );
}
