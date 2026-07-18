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
