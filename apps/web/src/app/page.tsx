import type { Metadata } from "next";
import type { Deal } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "./api/v1/deals/route.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { SiteFooter } from "../components/SiteFooter.js";
import { Ticker } from "../components/Ticker.js";
import { HeroBand } from "../components/HeroBand.js";
import { Feed } from "./Feed.js";
import { construireParamsFeed } from "../lib/feedPagination.js";

const DESCRIPTION = "Les meilleurs bons plans et promotions au Maroc, votés par la communauté : alimentaire, high-tech, mode et plus.";

export const metadata: Metadata = {
  // absolute : contourne le template "%s — Fidwastafid" du layout, ce
  // titre porte déjà le nom du site.
  title: { absolute: "Fidwastafid — Bons plans au Maroc" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: "Fidwastafid — Bons plans au Maroc", description: DESCRIPTION, url: "/" },
};

/**
 * SSR par requête, pas de pré-rendu statique au build (plan v2 : "Feed en
 * SSR — rendu serveur, HTML complet pour Google", donc bien par requête).
 * Sans ça, `next build` tente de générer cette page statiquement et échoue
 * faute de DATABASE_URL à l'étape de build Docker (elle n'existe qu'au
 * runtime, via docker-compose).
 */
export const dynamic = "force-dynamic";

interface DealsPage {
  data: Deal[];
  nextCursor: string | null;
}

/**
 * Appel direct du handler de route plutôt qu'un fetch HTTP vers soi-même :
 * pas de base URL à deviner (dev/Docker/Vercel ont des origines
 * différentes), et ça reste la même API que le web/mobile consommeront
 * plus tard (CONTRAT-V1 : une seule porte d'entrée /api/v1).
 *
 * Renvoie désormais le `nextCursor` en plus des deals : il était typé ici
 * depuis toujours mais jamais transmis, si bien que le feed s'arrêtait à la
 * première page (57 des 81 deals publiés invisibles en production).
 */
async function fetchFeed(): Promise<DealsPage> {
  const params = construireParamsFeed({ tri: "tendance" });
  const response = await getDealsHandler(new Request(`http://localhost/api/v1/deals?${params.toString()}`));
  const body = (await response.json()) as DealsPage;
  return { data: body.data, nextCursor: body.nextCursor };
}

type PageParams = { searchParams: Promise<{ compte?: string; motdepasse?: string }> };

export default async function Home({ searchParams }: PageParams) {
  const [premierePage, { compte, motdepasse }] = await Promise.all([fetchFeed(), searchParams]);
  const message =
    compte === "supprime"
      ? "Ton compte a bien été supprimé. Merci d'avoir fait partie de la communauté."
      : motdepasse === "reinitialise"
        ? "Ton mot de passe a bien été mis à jour."
        : null;

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      {message && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="bg-surface border border-accent/30 rounded-xl p-4 text-sm font-bold text-accent text-center">
            {message}
          </div>
        </div>
      )}
      <Ticker />
      <Feed initialDeals={premierePage.data} initialCursor={premierePage.nextCursor} hero={<HeroBand />} />
      <SiteFooter />
    </div>
  );
}
