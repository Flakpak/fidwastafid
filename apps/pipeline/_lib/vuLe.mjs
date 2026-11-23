// ============================================================
// FIDWASTAFID — « Revu » = présent à la source (lots SEO-2e et SEO-2e-bis,
// CONTRAT-V1 §3, vingt-troisième amendement)
//
// SOURCE UNIQUE de l'écriture de `deals.vu_le`, appelée par insert-deals.mjs
// AVANT tout filtre, et par la suite d'intégration (Postgres réel).
//
// Entrée : TOUT ce que le scraper a lu avec un prix (`releves` de la trace),
// remisé ou non. Un deal encore en ligne mais passé sous le seuil de remise
// reste « présent » ; les filtres ne décident que de l'insertion.
//
// Clé : celle de la déduplication d'insert-deals.mjs (titre sans casse +
// enseigne + prix promo). Un prix différent n'est pas une correspondance.
// Deals concernés : non expirés et non supprimés.
//
// UNE seule requête par source et par run. Seule `vu_le` change : ni le prix,
// ni `updated_at` (date de vraie modification, lue par le sitemap). Toute
// erreur remonte et fait échouer le run.
// ============================================================

import { decoderEntitesHtml } from "../entites-html.mjs";

/** Même normalisation du titre que mapDeal() d'insert-deals.mjs. */
function titreNormalise(titre) {
  return decoderEntitesHtml(titre).trim().slice(0, 200);
}

/**
 * @param {import("pg").Client | import("pg").PoolClient} client
 * @param {{ releves: { titre: string, prix: number }[], enseigneId: string | number }} entree
 * @returns {Promise<string[]>} id des deals dont vu_le a été mis à jour
 */
export async function marquerReleves(client, { releves, enseigneId }) {
  if (releves.length === 0) return [];
  const titres = releves.map((r) => titreNormalise(r.titre));
  const prix = releves.map((r) => r.prix);
  const { rows } = await client.query(
    `with lus as (
       select distinct lower(t) as titre, p as prix
         from unnest($1::text[], $2::numeric[]) as u(t, p)
     )
     update deals d
        set vu_le = now()
       from lus
      where d.enseigne_id = $3
        and lower(d.titre) = lus.titre
        and d.prix_promo = lus.prix
        and (d.date_fin is null or d.date_fin >= current_date)
        and d.supprime_le is null
        and d.statut <> 'expire'
      returning d.id`,
    [titres, prix, enseigneId]
  );
  return rows.map((r) => String(r.id));
}
