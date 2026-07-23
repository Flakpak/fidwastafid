import type { PoolClient } from "@fidwastafid/db";
import { dealSchema, dealAdminSchema, type Deal, type DealAdmin } from "@fidwastafid/schemas";

/**
 * Colonnes lues pour toute représentation publique d'un deal (liste ou détail).
 * `whatsapp_contact`/`whatsapp_public` sont lues ici (même pour les requêtes
 * publiques) — nécessaires à toDeal() pour décider de l'exposition
 * conditionnelle (CONTRAT-V1 §4, amendement du 18/07/2026), même si
 * whatsapp_contact lui-même ne sort du payload que si whatsapp_public=true.
 */
export const DEAL_SELECT = `
  d.public_id, d.titre, e.slug as enseigne_slug, e.nom as enseigne_nom,
  d.nom_vendeur, d.adresse, d.lien_maps, d.ville, d.categorie, d.type,
  d.prix_promo, d.prix_normal, d.date_fin, d.description, d.lien, d.image_key,
  d.whatsapp_contact, d.whatsapp_public,
  d.statut, d.score, u.public_id as submitter_public_id, u.pseudo as submitter_pseudo,
  u.couleur_avatar as submitter_couleur_avatar,
  (select count(*) from commentaires c where c.deal_id = d.id)::int as commentaires_count,
  d.created_at, d.updated_at
`;

/**
 * `left join` sur enseignes — CONTRAT-V1 §3, amendement : un deal peut
 * ne pas avoir d'enseigne (enseigne_id nullable). Un `join` (inner)
 * exclurait silencieusement ces deals de toute l'API.
 */
export const DEAL_FROM = `
  from deals d
  left join enseignes e on e.id = d.enseigne_id
  left join users u on u.id = d.submitter_id
`;

export interface DealRow {
  public_id: string;
  titre: string;
  enseigne_slug: string | null;
  enseigne_nom: string | null;
  nom_vendeur: string | null;
  adresse: string | null;
  lien_maps: string | null;
  ville: string | null;
  categorie: string;
  type: string;
  prix_promo: string;
  prix_normal: string | null;
  date_fin: string | null;
  description: string | null;
  lien: string | null;
  image_key: string | null;
  whatsapp_contact: string | null;
  whatsapp_public: boolean;
  statut: string;
  score: number;
  submitter_public_id: string | null;
  submitter_pseudo: string | null;
  submitter_couleur_avatar: string | null;
  commentaires_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * L'id interne bigint n'est jamais dans DealRow — impossible de l'exposer
 * par erreur ici (CONTRAT-V1 §1).
 */
export function toDeal(row: DealRow): Deal {
  return dealSchema.parse({
    publicId: row.public_id,
    titre: row.titre,
    enseigneSlug: row.enseigne_slug ?? undefined,
    enseigneNom: row.enseigne_nom ?? undefined,
    nomVendeur: row.nom_vendeur ?? undefined,
    adresse: row.adresse ?? undefined,
    lienMaps: row.lien_maps ?? undefined,
    ville: row.ville ?? undefined,
    categorie: row.categorie,
    type: row.type,
    prixPromo: Number(row.prix_promo),
    prixNormal: row.prix_normal === null ? undefined : Number(row.prix_normal),
    dateFin: row.date_fin ?? undefined,
    description: row.description ?? undefined,
    lien: row.lien ?? undefined,
    // Exposition conditionnelle (CONTRAT-V1 §4, amendement du 18/07/2026) :
    // absent (jamais null) tant que le soumetteur n'a pas consenti.
    whatsappContact: row.whatsapp_public && row.whatsapp_contact ? row.whatsapp_contact : undefined,
    imageKey: row.image_key ?? undefined,
    statut: row.statut,
    score: row.score,
    submitterPublicId: row.submitter_public_id,
    submitterPseudo: row.submitter_pseudo,
    submitterCouleurAvatar: row.submitter_couleur_avatar,
    commentairesCount: row.commentaires_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

/** Statuts visibles sans auth — CONTRAT-V1 §1 : un deal expiré reste 200, jamais 404. */
export const PUBLIC_STATUTS = new Set(["publie", "expire"]);

/**
 * Colonnes admin — ajoute motif_rejet. whatsapp_contact/whatsapp_public sont
 * déjà dans DEAL_SELECT (lus pour la décision d'exposition publique) ; ici on
 * les rend TOUJOURS visibles, sans condition (CONTRAT-V1 §4).
 */
export const DEAL_ADMIN_SELECT = `${DEAL_SELECT}, d.motif_rejet`;

export interface DealAdminRow extends DealRow {
  motif_rejet: string | null;
}

export function toDealAdmin(row: DealAdminRow): DealAdmin {
  return dealAdminSchema.parse({
    ...toDeal(row),
    whatsappContact: row.whatsapp_contact,
    whatsappPublic: row.whatsapp_public,
    motifRejet: row.motif_rejet,
  });
}

/**
 * Détection de doublon produit — VISIBILITÉ ADMIN SEULE (lot du 23/07/2026).
 * Le pipeline déduplique sur titre+enseigne+prix (insert-deals.mjs) alors que
 * l'identité stable d'un produit est son `lien` : toute variation de prix
 * crée un doublon, y compris en dupliquant un deal déjà `publie` par un
 * nouvel `auto_draft`. Ce LATERAL ne CORRIGE rien (aucune modification
 * automatique — l'admin reste seul décisionnaire) ; il expose, pour chaque
 * deal affiché, l'AUTRE deal le plus pertinent du même produit.
 *
 * Rapprochement : même `enseigne_id` ET (même `lien` si présent — fort),
 * sinon repli sur `lower(titre)` quand `lien` est null (ex. inwi, dont les
 * deals n'ont pas de lien produit vérifiable — rapprochement faible, marqué
 * `par_lien = false` pour l'affichage). Priorité au `publie` (le plus
 * important à signaler : « déjà publié »), sinon le plus récent. `count(*)
 * over()` compte tous les autres, avant le LIMIT 1 du représentant.
 *
 * Perf : une exécution par ligne affichée ; `deals_enseigne_idx` restreint
 * par enseigne avant le filtre lien/titre. Acceptable à l'échelle actuelle
 * (admin solo, table bornée par l'expiration auto_draft > 14 j). Un index
 * dédié sur (enseigne_id, lien) serait un follow-up si le volume grandit.
 */
export const DEAL_DOUBLON_JOIN = `
  left join lateral (
    select o.public_id, o.titre, o.statut, o.prix_promo,
           (d.lien is not null and o.lien = d.lien) as par_lien,
           (count(*) over())::int as nb
    from deals o
    where o.id <> d.id
      and o.enseigne_id = d.enseigne_id
      and (
        (d.lien is not null and o.lien = d.lien)
        or (d.lien is null and lower(o.titre) = lower(d.titre))
      )
    order by (o.statut = 'publie') desc, o.created_at desc
    limit 1
  ) dup on true
`;

export const DEAL_DOUBLON_SELECT = `
  dup.public_id as dup_public_id, dup.titre as dup_titre, dup.statut as dup_statut,
  dup.prix_promo as dup_prix_promo, dup.par_lien as dup_par_lien, dup.nb as dup_nb
`;

export interface DoublonColumns {
  dup_public_id: string | null;
  dup_titre: string | null;
  dup_statut: string | null;
  dup_prix_promo: string | null;
  dup_par_lien: boolean | null;
  dup_nb: number | null;
}

/**
 * Info de doublon attachée à un deal admin — hors `dealAdminSchema` (donc
 * hors contrat openapi) : c'est un enrichissement d'affichage admin, pas un
 * champ du modèle de domaine. `parLien` distingue le rapprochement fort (même
 * lien produit) du repli faible (titre, quand lien null).
 */
export interface DoublonInfo {
  publicId: string;
  titre: string;
  statut: string;
  prixPromo: number;
  parLien: boolean;
  nb: number;
}

export function toDoublon(row: DoublonColumns): DoublonInfo | null {
  if (!row.dup_public_id) return null;
  return {
    publicId: row.dup_public_id,
    titre: row.dup_titre ?? "",
    statut: row.dup_statut ?? "",
    prixPromo: Number(row.dup_prix_promo),
    parLien: row.dup_par_lien ?? false,
    nb: row.dup_nb ?? 1,
  };
}

/**
 * `deals.id` (bigint) revient en string via pg (évite la perte de précision
 * JS) — jamais renvoyé au client, uniquement pour les requêtes internes de
 * la même transaction (vote, recalcul de score).
 */
export async function lockDealIdByPublicId(client: PoolClient, publicId: string): Promise<string | null> {
  const result = await client.query<{ id: string }>("select id from deals where public_id = $1 for update", [
    publicId,
  ]);
  return result.rows[0]?.id ?? null;
}

/**
 * Recalcule deals.score depuis les votes existants — appelé dans la même
 * transaction que l'insert/update/delete sur votes (décision explicite :
 * synchrone, pas de trigger, pas d'async).
 */
export async function recalculateScore(client: PoolClient, dealId: string): Promise<void> {
  await client.query(
    `update deals set score = (
       select coalesce(count(*) filter (where sens = 'chaud'), 0)
            - coalesce(count(*) filter (where sens = 'froid'), 0)
       from votes where deal_id = $1
     ), updated_at = now()
     where id = $1`,
    [dealId]
  );
}

export async function fetchDealById(client: PoolClient, dealId: string): Promise<DealRow | null> {
  const result = await client.query<DealRow>(`select ${DEAL_SELECT} ${DEAL_FROM} where d.id = $1`, [dealId]);
  return result.rows[0] ?? null;
}
