// ============================================================
// FIDWASTAFID — Passe rétroactive de recatégorisation aswakassalam.com
// (14/08/2026, mapCategorie() enrichi Électroménager/High-Tech/Sport par
// rayon, PR #139) — DÉSARMÉ PAR DÉFAUT, même convention que
// recategoriser-autre.mjs / purger-images.mjs.
// Usage : node recategoriser-aswakassalam.mjs
//
// PÉRIMÈTRE — 11 lignes précises, pas une requête générale : le rayon
// WooCommerce n'est stocké nulle part en base (scraper-aswakassalam.mjs ne
// peuple pas la colonne `rayon`, seul scraper-bringo.mjs le fait), donc un
// recalcul générique depuis la seule base est impossible pour cette source —
// contrairement à recategoriser-autre.mjs (Bringo). Les 11 candidats et leur
// nouvelle catégorie ont été déterminés en rejouant mapCategorie() contre le
// catalogue live aswakassalam.com (rayon retrouvé par correspondance de
// permalink), rapportés à Kamel en mode à blanc, confirmés le 14/08/2026.
// Rejeu volontairement PAS automatisé ici : figer la liste validée évite
// toute dérive entre la proposition et l'écriture (le catalogue live change).
//
// journal_audit : même schéma que recategoriser-autre.mjs — action
// 'update_deal', `details.lot` identifie CETTE passe (clé de réversion).
//
// RÉVERSION (si le résultat déçoit) :
//   update deals set categorie = 'Autre'
//    where public_id in (
//      select cible_id from journal_audit
//       where action = 'update_deal' and details->>'lot' = '<LOT_ID affiché au run>'
//    );
// ============================================================

import pg from "pg";
import { pathToFileURL } from "node:url";
import { UTILISATEUR_SYSTEME_ID } from "./_lib/utilisateurSysteme.mjs";

export const RECATEGORISATION_LOT_ID = "retroactif-aswakassalam-2026-08-14";

/** Liste validée le 14/08/2026 — voir en-tête. */
export const RECLASSEMENTS = [
  { public_id: "62dv5fi6yv", categorie: "High-Tech" }, // GALAXY TAB Z10... | MULTIMÉDIA, SMARTPHONES & TABLETTES
  { public_id: "js67zptqtu", categorie: "Électroménager" }, // YAOURTIERE 7 POTS... | PETIT ÉLECTROMÉNAGER, PREPARATION ALIMENTS
  { public_id: "nkjgweb4zg", categorie: "Sport" }, // MEDECINE BALL ANTIDERAPANTE 4KG | PLEIN AIR/JOUETS/LOISIRS, SPORT
  { public_id: "pr4g3pun25", categorie: "Sport" }, // MEDECINE BALL ANTIDERAPANTE 3KG | PLEIN AIR/JOUETS/LOISIRS, SPORT
  { public_id: "eppxrmc7wf", categorie: "Électroménager" }, // CUISEUR A OEUFS... | CUISSON CONVIVIALE, PETIT ÉLECTROMÉNAGER
  { public_id: "xjam86b7nx", categorie: "Électroménager" }, // FER A REPASSER 2800W SOLAC | PETIT ÉLECTROMÉNAGER, TRAITEMENT DU LINGE
  { public_id: "2gqfvxedss", categorie: "Électroménager" }, // FER A REPASSER 1100W TAURUS | PETIT ÉLECTROMÉNAGER, TRAITEMENT DU LINGE
  { public_id: "gf58kdqwq8", categorie: "Électroménager" }, // FER A REPASSER CERAMIC 2200W TAURUS | PETIT ÉLECTROMÉNAGER, TRAITEMENT DU LINGE
  { public_id: "any3dxbkbn", categorie: "Électroménager" }, // VENTILATEUR TEFAL | CHAUFFAGE & CLIMATISATION, PETIT ÉLECTROMÉNAGER
  { public_id: "5w665fzavr", categorie: "High-Tech" }, // TELECOMMANDE ANDROID AZATECH | IMAGE, MULTIMÉDIA
  { public_id: "7w36qhsk3x", categorie: "High-Tech" }, // RECEPTEUR HD A800 AZATECH | IMAGE, MULTIMÉDIA
];

export async function recategoriserAswakassalam({ client, actif = false }) {
  let reclasses = 0;
  let sautees = 0;
  const details = [];

  for (const { public_id, categorie } of RECLASSEMENTS) {
    // Garde categorie='Autre' : si une correction manuelle a déjà changé
    // cette ligne entre la proposition et l'écriture, 0 ligne affectée,
    // jamais un écrasement de décision humaine plus récente.
    const { rows: avant } = await client.query(
      `select categorie from deals where public_id = $1`,
      [public_id]
    );
    if (avant.length === 0 || avant[0].categorie !== "Autre") {
      sautees++;
      details.push({ public_id, statut: "sautee", raison: avant.length === 0 ? "introuvable" : `déjà "${avant[0].categorie}"` });
      continue;
    }

    if (actif) {
      const maj = await client.query(
        `update deals set categorie = $1 where public_id = $2 and categorie = 'Autre' returning id`,
        [categorie, public_id]
      );
      if (maj.rowCount !== 1) {
        sautees++;
        details.push({ public_id, statut: "sautee", raison: "course concurrente" });
        continue;
      }
      await client.query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'update_deal', 'deal', $2, $3)`,
        [
          UTILISATEUR_SYSTEME_ID,
          public_id,
          JSON.stringify({ categorie: { avant: "Autre", apres: categorie }, automatise: true, lot: RECATEGORISATION_LOT_ID }),
        ]
      );
    }
    reclasses++;
    details.push({ public_id, statut: "reclasse", categorie });
  }

  return { total: RECLASSEMENTS.length, reclasses, sautees, actif, lotId: RECATEGORISATION_LOT_ID, details };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) {
    console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
    process.exit(1);
  }
  const actif = process.env.RECATEGORISER_ASWAKASSALAM_ACTIF === "true";
  console.log(actif ? "⚠️  MODE ACTIF — écriture réelle." : "🔍 Mode à blanc (par défaut) — aucune écriture.");
  console.log(`Lot : ${RECATEGORISATION_LOT_ID} — ${RECLASSEMENTS.length} candidats.`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log("🔌 Connecté à la base.");
    const resultat = await recategoriserAswakassalam({ client, actif });
    console.log(`\n${actif ? "Recatégorisé" : "Serait recatégorisé"} : ${resultat.reclasses} / ${resultat.total}.`);
    if (resultat.sautees > 0) console.log(`Sautés : ${resultat.sautees}`);
    for (const d of resultat.details) console.log(`  [${d.public_id}] ${d.statut}${d.categorie ? " -> " + d.categorie : ""}${d.raison ? " (" + d.raison + ")" : ""}`);
  } catch (err) {
    console.error("❌ Échec :", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
