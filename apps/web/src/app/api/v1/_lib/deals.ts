import { dealSchema, type Deal } from "@fidwastafid/schemas";

/** Colonnes lues pour toute représentation publique d'un deal (liste ou détail). */
export const DEAL_SELECT = `
  d.public_id, d.titre, e.slug as enseigne_slug, d.ville, d.categorie, d.type,
  d.prix_promo, d.prix_normal, d.date_fin, d.description, d.lien, d.image_key,
  d.statut, d.score, u.public_id as submitter_public_id, d.created_at, d.updated_at
`;

export const DEAL_FROM = `
  from deals d
  join enseignes e on e.id = d.enseigne_id
  left join users u on u.id = d.submitter_id
`;

export interface DealRow {
  public_id: string;
  titre: string;
  enseigne_slug: string;
  ville: string | null;
  categorie: string;
  type: string;
  prix_promo: string;
  prix_normal: string | null;
  date_fin: string | null;
  description: string | null;
  lien: string | null;
  image_key: string | null;
  statut: string;
  score: number;
  submitter_public_id: string | null;
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
    enseigneSlug: row.enseigne_slug,
    ville: row.ville ?? undefined,
    categorie: row.categorie,
    type: row.type,
    prixPromo: Number(row.prix_promo),
    prixNormal: row.prix_normal === null ? undefined : Number(row.prix_normal),
    dateFin: row.date_fin ?? undefined,
    description: row.description ?? undefined,
    lien: row.lien ?? undefined,
    imageKey: row.image_key ?? undefined,
    statut: row.statut,
    score: row.score,
    submitterPublicId: row.submitter_public_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

/** Statuts visibles sans auth — CONTRAT-V1 §1 : un deal expiré reste 200, jamais 404. */
export const PUBLIC_STATUTS = new Set(["publie", "expire"]);
