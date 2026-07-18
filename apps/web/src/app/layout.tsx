import type { Metadata } from "next";
import { Scheherazade_New } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
      <body>
        {children}
        {/*
         * Script (/_vercel/insights/script.js) et endpoint de collecte
         * (/_vercel/insights/*) tous deux même origine — déjà couverts par
         * le CSP existant (script-src 'strict-dynamic' pour l'injection
         * dynamique via document.createElement depuis notre propre bundle
         * nonce'd ; connect-src 'self' pour la collecte). Le composant
         * n'expose pas de prop nonce (cf. github.com/vercel/analytics#122,
         * toujours ouvert) — non nécessaire ici puisque rien n'est
         * cross-origin. Aucun ajustement CSP requis.
         */}
        <Analytics />
      </body>
    </html>
  );
}
