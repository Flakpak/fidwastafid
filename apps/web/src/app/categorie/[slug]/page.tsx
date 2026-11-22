import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubPage } from "../../../components/HubPage.js";
import {
  hubParSlug,
  robotsCategorie,
  titreCategorie,
  descriptionCategorie,
  LIMITE_DEALS_CATEGORIE,
} from "../../../lib/hubs.js";
import { compterCategories, categoriesIndexables, fetchDealsCategorie } from "../../api/v1/_lib/hubs.js";

/**
 * /categorie/[slug] — CONTRAT-V1 §3, vingt-deuxième amendement (lot SEO-3).
 * 13 slugs fixes (content/hubs.ts) ; « autre » et tout slug hors liste → 404.
 * Indexable dès SEUIL_INDEXATION_CATEGORIE deals publiés actifs, sinon
 * `noindex, follow` (et absente du sitemap) — bascule automatique.
 */
export const dynamic = "force-dynamic";

type PageParams = { params: Promise<{ slug: string }> };

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
  const canonical = `/categorie/${hub.slug}`;

  return {
    // absolute : le titre est imposé tel quel, sans le suffixe du layout.
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...robotsCategorie(nombre),
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function CategoriePage({ params }: PageParams) {
  const { slug } = await params;
  const hub = hubParSlug(slug);
  if (!hub) notFound();

  const [deals, indexables] = await Promise.all([
    fetchDealsCategorie(hub.categorie, LIMITE_DEALS_CATEGORIE),
    categoriesIndexables(),
  ]);

  return (
    <HubPage
      maillons={[{ nom: "Accueil", chemin: "/" }, { nom: hub.categorie }]}
      h1={hub.h1}
      intro={hub.intro}
      darija={hub.darija}
      deals={deals}
      vide={`Aucune promo ${hub.categorie.toLowerCase()} en cours pour l'instant.`}
      titreLiens="Autres catégories"
      liens={indexables
        .filter((c) => c.hub.slug !== hub.slug)
        .map((c) => ({ href: `/categorie/${c.hub.slug}`, libelle: c.hub.categorie, nombre: c.nombre }))}
    />
  );
}
