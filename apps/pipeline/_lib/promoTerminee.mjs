// ============================================================
// FIDWASTAFID — Une promo terminée à la source est ignorée (lot SEO-2l)
//
// L'API carrefour.ma liste encore des promotions dont la date de fin est
// passée. Un tel élément n'est pas « présent à la source » : il ne met pas à
// jour vu_le, ne réactive rien, ne modifie aucune fiche et n'est pas inséré.
// Le jour de fin lui-même reste une promo en cours.
//
// Le jour courant à Casablanca vient de Postgres, jamais de Node (PR #190).
// ============================================================

export async function jourCasablanca(client) {
  const { rows } = await client.query(
    "select (now() at time zone 'Africa/Casablanca')::date::text as jour"
  );
  const jour = rows[0]?.jour;
  if (!jour) throw new Error("jourCasablanca : Postgres n'a renvoyé aucune ligne.");
  return jour;
}

/** Dates AAAA-MM-JJ, comparables comme chaînes. Sans date de fin : en cours. */
export function promoTerminee(dateFin, jour) {
  return Boolean(dateFin) && String(dateFin).slice(0, 10) < jour;
}

/**
 * Retire les promos terminées de l'archive et des relevés.
 * `ignores` : produits lus à date de fin passée (une ligne par produit).
 */
export function retirerPromosTerminees({ deals, releves }, jour) {
  const dealsEnCours = deals.filter((d) => !promoTerminee(d.date_fin, jour));
  const relevesEnCours = releves.filter((r) => !promoTerminee(r.dateFin, jour));
  const ignores = releves.filter((r) => r.principal !== false && promoTerminee(r.dateFin, jour)).length;
  return { dealsEnCours, relevesEnCours, ignores, ignoresArchive: deals.length - dealsEnCours.length };
}
