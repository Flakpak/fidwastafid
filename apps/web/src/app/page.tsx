import type { Metadata } from "next";
import type { Deal } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "./api/v1/deals/route.js";
import { GET as getCompteHandler } from "./api/v1/deals/compte/route.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { SiteFooter } from "../components/SiteFooter.js";
import { Ticker } from "../components/Ticker.js";
import { HeroBand } from "../components/HeroBand.js";
import { Feed } from "./Feed.js";
import { construireParamsCompte, construireParamsFeed } from "../lib/feedPagination.js";
import { lireFiltresUrl, type EtatFiltres } from "../lib/filtresFeed.js";
import { resolveCurrentUser } from "../lib/currentUser.js";


const DESCRIPTION = "Les meilleurs bons plans et promotions au Maroc, votés par la communauté : alimentaire, high-tech, mode et plus.";

export const metadata: Metadata = {
  // absolute : contourne le template "%s — Fidwastafid" du layout, ce
  // titre porte déjà le nom du site.
  title: { absolute: "Fidwastafid — Bons plans au Maroc" },
  description: DESCRIPTION,
  // Une vue filtrée reste une vue de l'accueil : canonique unique, jamais
  // une page indexable par combinaison de filtres.
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
 * Appel direct des handlers de route plutôt qu'un fetch HTTP vers soi-même :
 * pas de base URL à deviner (dev/Docker/Vercel ont des origines
 * différentes), et ça reste la même API que le web/mobile consommeront
 * plus tard (CONTRAT-V1 : une seule porte d'entrée /api/v1).
 *
 * Les DEUX appels partent des mêmes filtres, lus dans l'URL : un feed filtré
 * partagé s'ouvre déjà filtré, avec son compteur de résultats déjà juste —
 * sans passe client ni valeur qui change sous les yeux après hydratation.
 */
async function fetchFeed(filtres: EtatFiltres): Promise<DealsPage> {
  const params = construireParamsFeed(filtres);
  const response = await getDealsHandler(new Request(`http://localhost/api/v1/deals?${params.toString()}`));
  const body = (await response.json()) as DealsPage;
  return { data: body.data, nextCursor: body.nextCursor };
}

async function fetchTotal(filtres: EtatFiltres): Promise<number | null> {
  const params = construireParamsCompte(filtres);
  const response = await getCompteHandler(new Request(`http://localhost/api/v1/deals/compte?${params.toString()}`));
  if (!response.ok) return null;
  return ((await response.json()) as { total: number }).total;
}

type PageParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Les valeurs répétées (`?ville=A&ville=B`) sont réduites à la première :
 *  l'interface ne peut en produire qu'une, et les filtres restent à choix
 *  unique. */
function versSearchParams(brut: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    const premiere = Array.isArray(valeur) ? valeur[0] : valeur;
    if (typeof premiere === "string") params.set(cle, premiere);
  }
  return params;
}

export default async function Home({ searchParams }: PageParams) {
  const brut = await searchParams;
  const filtres = lireFiltresUrl(versSearchParams(brut));
  // `resolveCurrentUser()` est déjà appelé par SiteHeader ci-dessous —
  // dédupliqué par requête (cache(), React) : ce troisième appel ne coûte
  // rien de plus. Seul un booléen part vers Feed (CONTRAT-V1 §4, seizième
  // amendement conscient) — jamais l'identité elle-même.
  const [premierePage, total, utilisateurCourant] = await Promise.all([
    fetchFeed(filtres),
    fetchTotal(filtres),
    resolveCurrentUser(),
  ]);

  const compte = typeof brut.compte === "string" ? brut.compte : undefined;
  const motdepasse = typeof brut.motdepasse === "string" ? brut.motdepasse : undefined;
  const message =
    compte === "supprime"
      ? "Ton compte a bien été supprimé. Merci d'avoir fait partie de la communauté."
      : motdepasse === "reinitialise"
        ? "Ton mot de passe a bien été mis à jour."
        : null;

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      {/* Ordre de page identique à celui d'avant le lot 7 : en-tête, bandeau
          de message, ticker, hero. Seule la barre de filtres est collante
          (Feed.tsx) — l'en-tête défile normalement, ce qui rend sa hauteur au
          contenu pendant la navigation. */}
      <SiteHeader collant={false} />
      {message && (
        <div className="mx-auto mt-4 max-w-2xl px-4">
          <div className="rounded-xl border border-accent/30 bg-surface p-4 text-center text-sm font-bold text-accent">
            {message}
          </div>
        </div>
      )}
      <Ticker />
      <Feed
        hero={<HeroBand />}
        initialDeals={premierePage.data}
        initialCursor={premierePage.nextCursor}
        initialFiltres={filtres}
        initialTotal={total}
        estConnecte={Boolean(utilisateurCourant)}
      />
      <SiteFooter />
    </div>
  );
}
