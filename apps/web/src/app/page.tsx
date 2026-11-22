import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader.js";
import { SiteFooter } from "../components/SiteFooter.js";
import { Ticker } from "../components/Ticker.js";
import { HeroBand } from "../components/HeroBand.js";
import { Feed } from "./Feed.js";
import { lireFiltresUrl } from "../lib/filtresFeed.js";
import { resolveCurrentUser } from "../lib/currentUser.js";
import { fetchFeed, fetchTotal, versSearchParams } from "../lib/feedServeur.js";
import { evenementParSlug, etatEvenement } from "../lib/hubs.js";
import { aujourdhuiCasablanca, categoriesFiltre } from "./api/v1/_lib/hubs.js";


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

type PageParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Entrée Black Friday du filtre (lot SEO-3b) : présente uniquement pendant la
 * fenêtre de l'édition, jour fourni par Postgres. Remplace le bloc séparé du
 * lot SEO-3.
 */
async function lienBlackFriday() {
  const evenement = evenementParSlug("black-friday");
  if (!evenement) return null;
  const { edition } = etatEvenement(evenement, await aujourdhuiCasablanca());
  return edition ? { href: `/bons-plans/${evenement.slug}`, libelle: evenement.nom } : null;
}

export default async function Home({ searchParams }: PageParams) {
  const brut = await searchParams;
  // Les DEUX appels (liste et compteur) partent des mêmes filtres, lus dans
  // l'URL : un feed filtré partagé s'ouvre déjà filtré (src/lib/feedServeur.ts).
  const filtres = lireFiltresUrl(versSearchParams(brut));
  // `resolveCurrentUser()` est déjà appelé par SiteHeader ci-dessous —
  // dédupliqué par requête (cache(), React) : ce troisième appel ne coûte
  // rien de plus. Seul un booléen part vers Feed (CONTRAT-V1 §4, seizième
  // amendement conscient) — jamais l'identité elle-même.
  const [premierePage, total, utilisateurCourant, liensCategories, lienEvenement] = await Promise.all([
    fetchFeed(filtres),
    fetchTotal(filtres),
    resolveCurrentUser(),
    categoriesFiltre(),
    lienBlackFriday(),
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
        liensCategories={liensCategories}
        lienEvenement={lienEvenement}
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
