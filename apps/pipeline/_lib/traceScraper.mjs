// ============================================================
// FIDWASTAFID — Trace de passage d'un scraper (lot SEO-2e, CONTRAT-V1 §3
// vingt-troisième amendement)
//
// Chaque scraper écrit, À CÔTÉ de son archive `extractions/<horodatage>_<source>.json`,
// un fichier `<même nom>.trace.json` :
//   { lus, plafondAtteint, interrompu }
// - lus            : éléments lus à la source (produits/cartes), AVANT tout
//                    filtrage du scraper (non remisés, incohérents…) ;
// - plafondAtteint : la boucle s'est arrêtée sur son plafond (pages, ou
//                    plafond de deals), pas sur la fin réelle du catalogue ;
// - interrompu     : une page a échoué en cours de pagination (lecture
//                    partielle).
// insert-deals.mjs l'EXIGE et le recopie dans pipeline_runs : sans trace, le
// run échoue (aucun repli silencieux). Ces trois valeurs servent à juger un
// run « complet » (amendement) avant toute expiration par absence.
//
// Fichier séparé plutôt qu'un changement de format de l'archive : l'archive
// reste un tableau de deals, lisible tel quel par les outils existants.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";

export function cheminTrace(fichierArchive) {
  if (!fichierArchive.endsWith(".json")) {
    throw new Error(`cheminTrace : archive .json attendue, reçu ${fichierArchive}`);
  }
  return fichierArchive.replace(/\.json$/, ".trace.json");
}

/** Écrit l'archive ET sa trace. Toute erreur d'écriture remonte. */
export function ecrireArchiveEtTrace(fichierArchive, deals, { lus, plafondAtteint, interrompu }) {
  validerTrace({ lus, plafondAtteint, interrompu });
  writeFileSync(fichierArchive, JSON.stringify(deals, null, 2), "utf8");
  writeFileSync(cheminTrace(fichierArchive), JSON.stringify({ lus, plafondAtteint, interrompu }, null, 2), "utf8");
  console.log(
    `→ Trace : ${lus} élément(s) lu(s) | plafond atteint : ${plafondAtteint ? "oui" : "non"} | interrompu : ${interrompu ? "oui" : "non"}`
  );
}

function validerTrace(t) {
  if (!Number.isInteger(t?.lus) || t.lus < 0) throw new Error(`trace invalide : lus=${t?.lus}`);
  if (typeof t.plafondAtteint !== "boolean") throw new Error(`trace invalide : plafondAtteint=${t.plafondAtteint}`);
  if (typeof t.interrompu !== "boolean") throw new Error(`trace invalide : interrompu=${t.interrompu}`);
}

/** Lit la trace d'une archive. Absente ou invalide → erreur (le run échoue). */
export function lireTrace(fichierArchive) {
  const chemin = cheminTrace(fichierArchive);
  let brut;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch (err) {
    throw new Error(`trace de passage absente (${chemin}) : ${err.message}`);
  }
  const t = JSON.parse(brut);
  validerTrace(t);
  return { lus: t.lus, plafondAtteint: t.plafondAtteint, interrompu: t.interrompu };
}
