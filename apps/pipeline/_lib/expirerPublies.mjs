// ============================================================
// FIDWASTAFID — Requête d'expiration des deals publiés (lot SEO-2b)
//
// SOURCE UNIQUE de la requête, appelée par expirer-publies.mjs (prod) et
// par la suite d'intégration (apps/web/tests/integration.ts, Postgres réel).
//
// La date du jour à Casablanca est calculée UNIQUEMENT par Postgres
// (`$1::timestamptz AT TIME ZONE 'Africa/Casablanca'`) — jamais par Node.
// Fait générateur (PR #190) : le Node 22 du runner CI et le Node 24 du poste
// local ne donnaient pas le même décalage pour Africa/Casablanca. Postgres,
// qui exécute la requête en prod, est la seule référence.
//
// `instant` : l'instant de référence, sous forme de texte timestamptz. En
// prod, la valeur de `SELECT now()::text` lue dans la même transaction ; en
// test, un instant fixe.
//
// Deux clauses conservées du modèle expirer-auto-draft.mjs :
// - `supprime_le IS NULL` : un deal soft-supprimé ne change pas de statut,
//   pour que sa restauration le renvoie à son vrai statut d'origine ;
// - `updated_at = $1` : le changement de statut rafraîchit `lastmod`
//   (sitemap) et la version de l'og:image, comme toute autre modification.
// ============================================================

/**
 * @param {import("pg").Client | import("pg").PoolClient} client
 * @param {string} instant timestamptz sous forme de texte
 * @returns {Promise<string[]>} public_id des deals expirés
 */
export async function expirerPublies(client, instant) {
  const { rows } = await client.query(
    `update deals
        set statut = 'expire', updated_at = $1::timestamptz
      where statut = 'publie'
        and supprime_le is null
        and date_fin < ($1::timestamptz at time zone 'Africa/Casablanca')::date
      returning public_id`,
    [instant]
  );
  return rows.map((r) => r.public_id);
}
