import type { Metadata } from "next";
import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "./api/v1/deals/route.js";

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

function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

export default async function Home() {
  const deals = await fetchFeed();

  return (
    <div className="min-h-screen bg-creme text-texte">
      <header className="bg-white border-b-2 border-bordure sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-arabic text-2xl text-rouge">
          فيدوستافيد
        </Link>
        <nav className="flex items-center gap-4 text-sm font-bold">
          <Link href="/soumettre" className="text-muted hover:text-rouge">
            Proposer un bon plan
          </Link>
          <Link href="/connexion" className="text-muted hover:text-rouge">
            Connexion
          </Link>
        </nav>
      </header>

      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-3">
        {deals.length === 0 && <p className="text-center text-muted py-16">Aucun bon plan pour l&apos;instant.</p>}
        {deals.map((deal) => {
          const pct = reduction(deal);
          return (
            <Link
              key={deal.publicId}
              href={`/deal/${dealUrlSlug(deal.titre, deal.publicId)}`}
              className="bg-white border border-bordure rounded-xl p-4 flex flex-col gap-2 hover:border-rouge-clair transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-bold text-muted">
                <span>
                  {deal.enseigneSlug}
                  {deal.ville ? ` · ${deal.ville}` : ""}
                </span>
                <span className="text-rouge">🔥 {deal.score}</span>
              </div>
              <h2 className="font-bold text-lg leading-snug line-clamp-2">{deal.titre}</h2>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-black text-rouge">{deal.prixPromo} DH</span>
                {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
                {pct !== null && (
                  <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{pct}%</span>
                )}
              </div>
            </Link>
          );
        })}
      </main>
    </div>
  );
}
