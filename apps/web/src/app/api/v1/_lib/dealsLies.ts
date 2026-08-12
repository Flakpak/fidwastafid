import { query } from "@fidwastafid/db";
import type { Deal } from "@fidwastafid/schemas";
import { DEAL_SELECT, DEAL_FROM, toDeal, type DealRow } from "./deals.js";

/** Quelques-uns, pas une liste — une fiche deal n'est pas un second feed. */
const LIMITE_DEALS_LIES = 4;

/**
 * Deals liés à AFFICHER en bas d'une fiche — même enseigne d'abord, puis
 * même catégorie (état des lieux SEO du 08/08/2026 : « aucun chemin entre
 * les fiches, aujourd'hui inexistant »). `statut = 'publie'` UNIQUEMENT —
 * jamais un `expire`, même protégé (sitemap, correctif du 12/08/2026) :
 * suggérer un deal potentiellement plus disponible reproduirait le défaut
 * qu'on retire du sitemap, dans l'autre sens. `publie` est TOUJOURS
 * indexable (`estActifSeo`, CONTRAT-V1 §1, dix-huitième amendement
 * conscient) — ce chemin ne peut donc jamais lier vers un deal `noindex`.
 *
 * `(e.slug = $2) desc` classe les correspondances par enseigne avant celles
 * par catégorie ; `$2` null (deal sans enseigne) rend cette comparaison
 * NULL pour toutes les lignes — l'ORDER BY retombe alors simplement sur
 * score/date, comportement correct sans cas particulier à écrire.
 */
export async function fetchDealsLies(deal: Deal): Promise<Deal[]> {
  if (!deal.enseigneSlug && !deal.categorie) return [];

  const rows = await query<DealRow>(
    `select ${DEAL_SELECT}
       ${DEAL_FROM}
      where d.supprime_le is null
        and d.statut = 'publie'
        and d.public_id != $1
        and (e.slug = $2 or d.categorie = $3)
      order by (e.slug = $2) desc, d.score desc, d.created_at desc
      limit $4`,
    [deal.publicId, deal.enseigneSlug ?? null, deal.categorie, LIMITE_DEALS_LIES]
  );
  return rows.map(toDeal);
}
