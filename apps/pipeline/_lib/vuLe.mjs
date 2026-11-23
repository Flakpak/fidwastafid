// ============================================================
// FIDWASTAFID — Passage d'un scraper sur un deal existant (lot SEO-2e,
// CONTRAT-V1 §3, vingt-troisième amendement)
//
// SOURCE UNIQUE de l'écriture de `deals.vu_le`, appelée par insert-deals.mjs
// et par la suite d'intégration (Postgres réel).
//
// Même clé que la déduplication d'insert-deals.mjs (titre sans casse +
// enseigne + prix promo, date de fin non passée, non supprimé), avec une
// exclusion de plus : un deal `expire` n'est pas « revu ». Toutes les lignes
// correspondantes sont marquées, pas seulement la première : la dédup
// s'arrête à `LIMIT 1`, qui pourrait tomber sur une ligne expirée et laisser
// le deal publié sans passage enregistré.
//
// Seule `vu_le` change : ni le prix, ni `updated_at` (qui reste la date de
// vraie modification du contenu, lue par le sitemap). Toute erreur remonte.
// ============================================================

/**
 * @param {import("pg").Client | import("pg").PoolClient} client
 * @param {{ titre: string, enseigneId: string | number, prixPromo: number }} cle
 * @returns {Promise<string[]>} id des deals dont vu_le a été mis à jour
 */
export async function marquerVu(client, { titre, enseigneId, prixPromo }) {
  const { rows } = await client.query(
    `update deals set vu_le = now()
      where lower(titre) = lower($1) and enseigne_id = $2
        and prix_promo = $3
        and (date_fin is null or date_fin >= current_date)
        and supprime_le is null
        and statut <> 'expire'
      returning id`,
    [titre, enseigneId, prixPromo]
  );
  return rows.map((r) => String(r.id));
}
