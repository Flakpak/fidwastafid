import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { SiteFooter } from "../../../components/SiteFooter.js";
import { FilAriane } from "../../../components/FilAriane.js";
import { Feed } from "../../Feed.js";
import {
  hubParSlug,
  robotsCategorie,
  titreCategorie,
  descriptionCategorie,
  canonicalCategorie,
} from "../../../lib/hubs.js";
import { lireFiltresUrl } from "../../../lib/filtresFeed.js";
import { resolveCurrentUser } from "../../../lib/currentUser.js";
import { fetchFeed, fetchTotal, versSearchParams } from "../../../lib/feedServeur.js";
import { compterCategories, categoriesFiltre } from "../../api/v1/_lib/hubs.js";

/**
 * /categorie/[slug] — CONTRAT-V1 §3, vingt-deuxième amendement (lots SEO-3
 * et SEO-3b). 13 slugs fixes (content/hubs.ts) ; « autre » et tout slug hors
 * liste → 404. Indexable dès SEUIL_INDEXATION_CATEGORIE deals publiés
 * actifs, sinon `noindex, follow` (et absente du sitemap).
 *
 * Lot SEO-3b : la page affiche LE MÊME feed et LE MÊME filtre que
 * l'accueil, catégorie courante active. Le tri, la ville, « où acheter » et
 * la recherche passent en paramètres d'URL ; la canonical reste
 * /categorie/[slug], sans paramètre.
 */
export const dynamic = "force-dynamic";

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function nombreActifs(categorie: string): Promise<number> {
  const comptes = await compterCategories();
  return comptes.find((c) => c.categorie === categorie)?.nombre ?? 0;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const hub = hubParSlug(slug);
  if (!hub) return { title: "Catégorie introuvable" };

  const nombre = await nombreActifs(hub.categorie);
  const title = titreCategorie(hub);
  const description = descriptionCategorie(hub, nombre);
  const canonical = canonicalCategorie(hub);

  return {
    // absolute : le titre est imposé tel quel, sans le suffixe du layout.
    title: { absolute: title },
    description,
    // Sans paramètre, quels que soient tri, ville ou recherche dans l'URL.
    alternates: { canonical },
    ...robotsCategorie(nombre),
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function CategoriePage({ params, searchParams }: PageParams) {
  const { slug } = await params;
  const hub = hubParSlug(slug);
  if (!hub) notFound();

  // La catégorie vient du chemin : un `?categorie=` dans l'URL est ignoré.
  const filtres = { ...lireFiltresUrl(versSearchParams(await searchParams)), categorie: hub.categorie };
  const [premierePage, total, utilisateurCourant, liensCategories] = await Promise.all([
    fetchFeed(filtres),
    fetchTotal(filtres),
    resolveCurrentUser(),
    categoriesFiltre(),
  ]);

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader collant={false} />
      <Feed
        hero={
          <div className="flex flex-col gap-2">
            <FilAriane maillons={[{ nom: "Accueil", chemin: "/" }, { nom: hub.categorie }]} />
            <h1 className="text-2xl font-black">{hub.h1}</h1>
            {/* Bloc darija (vingt-deuxième amendement) : `lang` et `dir` sur
                le bloc, la page reste en français. */}
            {hub.darija && (
              <p lang="ar-MA" dir="rtl" className="font-arabic text-lg text-ink">
                {hub.darija}
              </p>
            )}
            <p className="text-ink-muted leading-relaxed">{hub.intro}</p>
          </div>
        }
        initialDeals={premierePage.data}
        initialCursor={premierePage.nextCursor}
        initialFiltres={filtres}
        initialTotal={total}
        estConnecte={Boolean(utilisateurCourant)}
        liensCategories={liensCategories}
        categorieFigee={hub.categorie}
      />
      <SiteFooter />
    </div>
  );
}
