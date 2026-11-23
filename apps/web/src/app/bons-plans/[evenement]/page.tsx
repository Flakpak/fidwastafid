import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubPage } from "../../../components/HubPage.js";
import { INTRO_HORS_SAISON, h1HorsSaison } from "../../../../content/hubs.js";
import {
  evenementParSlug,
  etatEvenement,
  noteEdition,
  LIMITE_DEALS_EVENEMENT_EN_COURS,
  LIMITE_DEALS_HORS_SAISON,
  REMISE_MIN_EVENEMENT,
} from "../../../lib/hubs.js";
import {
  aujourdhuiCasablanca,
  categoriesIndexables,
  fetchDealsEdition,
  fetchMeilleuresRemises,
} from "../../api/v1/_lib/hubs.js";

/**
 * /bons-plans/[evenement] — CONTRAT-V1 §3, vingt-deuxième amendement (lot
 * SEO-3). Liste fermée (content/hubs.ts) ; hors liste → 404. URL sans année,
 * réutilisée à chaque édition. Jamais de 404 hors saison :
 * - dans la fenêtre d'une édition : deals publiés actifs REVUS À LA SOURCE
 *   dans les 48 dernières heures (lot SEO-2i), remise ≥ 20 %, 60 max ; sous
 *   8 deals, une phrase l'annonce (page toujours indexable) ;
 * - hors fenêtre : intro générique, meilleures remises du moment ;
 * - aucune édition configurée : idem, mais `noindex, follow` (et hors sitemap).
 * Le jour courant vient de Postgres (Africa/Casablanca), jamais de Node.
 */
export const dynamic = "force-dynamic";

type PageParams = { params: Promise<{ evenement: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { evenement: slug } = await params;
  const evenement = evenementParSlug(slug);
  if (!evenement) return { title: "Événement introuvable" };

  const { edition, indexable } = etatEvenement(evenement, await aujourdhuiCasablanca());
  const title = edition ? edition.title : h1HorsSaison(evenement.nom);
  const description = edition ? edition.description : INTRO_HORS_SAISON;
  const canonical = `/bons-plans/${evenement.slug}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description, url: canonical, type: "website" },
  };
}

export default async function EvenementPage({ params }: PageParams) {
  const { evenement: slug } = await params;
  const evenement = evenementParSlug(slug);
  if (!evenement) notFound();

  const { edition } = etatEvenement(evenement, await aujourdhuiCasablanca());
  const [deals, indexables] = await Promise.all([
    edition
      ? fetchDealsEdition(REMISE_MIN_EVENEMENT, LIMITE_DEALS_EVENEMENT_EN_COURS)
      : fetchMeilleuresRemises(LIMITE_DEALS_HORS_SAISON),
    categoriesIndexables(),
  ]);

  return (
    <HubPage
      maillons={[{ nom: "Accueil", chemin: "/" }, { nom: evenement.nom }]}
      h1={edition ? edition.h1 : h1HorsSaison(evenement.nom)}
      intro={edition ? edition.intro : INTRO_HORS_SAISON}
      darija={edition ? edition.darija : null}
      note={edition ? noteEdition(edition, deals.length) : null}
      deals={deals}
      vide="Aucune promotion à afficher pour l'instant."
      titreLiens="Parcourir par catégorie"
      liens={indexables.map((c) => ({ href: `/categorie/${c.hub.slug}`, libelle: c.hub.categorie, nombre: c.nombre }))}
    />
  );
}
