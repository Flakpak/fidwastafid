import type { Metadata } from "next";
import type { Deal } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "./api/v1/deals/route.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { DealCard } from "../components/DealCard.js";

export const metadata: Metadata = {
  title: "Fidwastafid — Bons plans au Maroc",
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
 */
async function fetchFeed(): Promise<Deal[]> {
  const response = await getDealsHandler(new Request("http://localhost/api/v1/deals?limit=24"));
  const body = (await response.json()) as DealsPage;
  return body.data;
}

export default async function Home() {
  const deals = await fetchFeed();

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />

      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-3">
        {deals.length === 0 && <p className="text-center text-muted py-16">Aucun bon plan pour l&apos;instant.</p>}
        {deals.map((deal) => (
          <DealCard key={deal.publicId} deal={deal} />
        ))}
      </main>
    </div>
  );
}
