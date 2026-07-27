/**
 * Diff pour le journal d'audit — ne retient que les champs RÉELLEMENT modifiés.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Fait générateur (27/07/2026, entrée `journal_audit` #240) : un
 * enregistrement du formulaire d'édition SANS aucun changement a produit un
 * diff `prixPromo: "100.00" → 100`, ainsi que des entrées `titre`, `type`,
 * `categorie` et `whatsappPublic` toutes identiques de part et d'autre.
 *
 * Deux défauts distincts, corrigés ici ensemble :
 *
 *   1. **Aucune comparaison n'était faite.** Tout champ présent dans le corps
 *      de la requête entrait dans le diff, changé ou non.
 *   2. **Les types ne coïncidaient pas des deux côtés.** `pg` renvoie les
 *      colonnes `numeric` (prix) et `bigint` (`enseigne_id`) en **chaîne** —
 *      pour ne pas tronquer leur précision — alors que le corps JSON porte des
 *      **nombres**. `"100.00" !== 100` est une inégalité de type, pas de
 *      valeur.
 *
 * > Un journal d'audit qui enregistre de faux changements perd sa valeur
 * > probante : au bout de quelques entrées, on cesse de le lire.
 *
 * La normalisation ci-dessous sert la comparaison ET la valeur consignée : le
 * journal enregistre la forme normalisée (`100`, pas `"100.00"`), pour que deux
 * entrées du même champ soient comparables entre elles dans le temps.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Type attendu du champ, déclaré explicitement par l'appelant plutôt que
 * deviné. Une règle générique « une chaîne numérique vaut le nombre
 * correspondant » traiterait `titre: "100"` comme égal à `100` — la déclaration
 * par champ interdit cette confusion.
 */
export type SorteChamp = "texte" | "nombre" | "booleen";

export interface ChampCompare {
  avant: unknown;
  apres: unknown;
  sorte: SorteChamp;
}

export type ValeurAudit = string | number | boolean | null;

/**
 * Ramène les deux côtés à une valeur comparable par `===`.
 *
 * `null` et `undefined` sont volontairement confondus en `null` : côté base
 * une colonne vide est `null`, côté patch un champ non fourni est `undefined`,
 * et l'appelant ne construit un `ChampCompare` que pour les champs réellement
 * présents dans la requête.
 *
 * Cas non convertible (`Number("abc")`) : on retombe sur la chaîne brute
 * plutôt que sur `NaN` ou `null`. `NaN !== NaN` déclarerait un changement à
 * chaque écriture ; `null` fusionnerait deux valeurs différentes en une. La
 * chaîne brute, elle, reste fidèle et comparable.
 */
export function normaliserValeurAudit(valeur: unknown, sorte: SorteChamp): ValeurAudit {
  if (valeur === null || valeur === undefined) return null;

  switch (sorte) {
    case "nombre": {
      if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : String(valeur);
      const nombre = Number(valeur);
      return Number.isFinite(nombre) ? nombre : String(valeur);
    }
    case "booleen": {
      if (typeof valeur === "boolean") return valeur;
      // `pg` renvoie déjà des booléens JS pour le type `boolean` ; ces formes
      // couvrent une source textuelle (formulaire, CSV d'import futur).
      if (valeur === "true" || valeur === "t") return true;
      if (valeur === "false" || valeur === "f") return false;
      return String(valeur);
    }
    case "texte":
      return typeof valeur === "string" ? valeur : String(valeur);
  }
}

/**
 * Filtre un ensemble de champs candidats : ne ressortent que ceux dont la
 * valeur normalisée a réellement changé. Un objet vide en sortie signifie
 * « enregistrement sans modification » — une information exacte, et non
 * l'absence de trace : l'appelant journalise l'action de toute façon.
 */
export function champsModifies(candidats: Record<string, ChampCompare>): Record<string, { avant: ValeurAudit; apres: ValeurAudit }> {
  const modifies: Record<string, { avant: ValeurAudit; apres: ValeurAudit }> = {};

  for (const [cle, { avant, apres, sorte }] of Object.entries(candidats)) {
    const avantNorm = normaliserValeurAudit(avant, sorte);
    const apresNorm = normaliserValeurAudit(apres, sorte);
    if (avantNorm !== apresNorm) modifies[cle] = { avant: avantNorm, apres: apresNorm };
  }

  return modifies;
}
