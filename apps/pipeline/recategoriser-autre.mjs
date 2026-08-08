// ============================================================
// FIDWASTAFID — Passe rétroactive de recatégorisation (mapCategorie()
// enrichi, PR #101/#102) — DÉSARMÉ PAR DÉFAUT, même convention que
// purger-images.mjs / purger-lignes.mjs.
// Usage : node recategoriser-autre.mjs
//
// Contexte : la migration 0018 fait que les PROCHAINS scrapes stockent le
// rayon et l'utilisent (0 % "Autre" attendu). Ce script traite le STOCK
// existant, dont le rayon n'a jamais été enregistré : seul le mapping
// titre seul s'applique, plafond mesuré à 23,4 % d'"Autre" restant
// (docs/IDEES.md).
//
// PÉRIMÈTRE :
//   - categorie = 'Autre' UNIQUEMENT : ne remet jamais en cause une
//     catégorie déjà correcte, jamais touchée par ce script.
//   - lien Bringo (bringo.ma) UNIQUEMENT : mapCategorie() est calibré sur
//     le vocabulaire du catalogue Carrefour/Bringo (mesuré sur 713 titres
//     réels) — l'appliquer à un titre d'une autre source serait deviner.
//     Mesuré en production le 08/08/2026 : 713 "Autre" Bringo, 1 "Autre"
//     hors Bringo — ce dernier RESTE "Autre", hors périmètre.
//   - supprime_le is null : une ligne supprimée n'a pas sa place à changer
//     de catégorie sans raison d'être revue.
//
// Un titre qui reste classé "Autre" après recalcul n'écrit RIEN (pas de
// changement, pas de trace) — seuls les reclassements réels comptent.
//
// journal_audit : réutilise l'action `update_deal` (déjà dans la liste
// fermée non-probante de deals_protection, migration 0015 — un changement
// de catégorie est exactement ce que cette action journalise déjà côté
// admin). `details.lot` identifie CETTE passe précisément : c'est la clé
// de la réversion (cf. RÉVERSION ci-dessous), qui ne doit annuler que ce
// que CE script a écrit, jamais une correction manuelle ultérieure.
//
// RÉVERSION (si le résultat déçoit) :
//   update deals set categorie = 'Autre'
//    where public_id in (
//      select cible_id from journal_audit
//       where action = 'update_deal' and details->>'lot' = '<LOT_ID affiché au run>'
//    );
//   Aucun DELETE, aucune ligne perdue — seule la colonne categorie revient
//   en arrière. La ligne journal_audit de la passe reste en place (trace),
//   la réversion elle-même s'audite comme une action manuelle normale.
// ============================================================

import pg from "pg";
import { mapCategorie } from "./_lib/categoriser.mjs";
import { UTILISATEUR_SYSTEME_ID } from "./_lib/utilisateurSysteme.mjs";

/** Identifiant de CETTE passe — sert de clé de réversion ciblée (cf. en-tête). */
export const RECATEGORISATION_LOT_ID = "retroactif-mapcategorie-2026-08-08";

const BRINGO_LIEN_RE = /^https:\/\/(www\.)?bringo\.ma\//i;

async function candidats(client) {
  const { rows } = await client.query(
    `select id, public_id, titre, lien
       from deals
      where categorie = 'Autre'
        and supprime_le is null
        and lien ~* '^https://(www\\.)?bringo\\.ma/'
      order by created_at asc`
  );
  return rows;
}

/**
 * @param {{ client: pg.Client | pg.Pool, actif?: boolean }} options
 * @returns {Promise<{
 *   total: number, reclasses: number, inchanges: number, sautees: number,
 *   parCategorie: Record<string, number>, actif: boolean, lotId: string,
 *   reclassements: Array<{ publicId: string, titre: string, categorie: string }>
 * }>}
 */
export async function recategoriserAutre({ client, actif = false }) {
  const rows = await candidats(client);

  const parCategorie = {};
  const reclassements = [];
  let inchanges = 0;
  let sautees = 0;

  for (const row of rows) {
    // Titre seul (jamais listName, jamais rayon) : ni l'un ni l'autre n'a
    // été enregistré pour ces lignes historiques — la migration 0018 ne
    // vaut que pour les scrapes futurs.
    const nouvelle = mapCategorie("", row.titre, "");
    if (nouvelle === "Autre") {
      inchanges++;
      continue;
    }

    if (actif) {
      // Garde `categorie = 'Autre'` reprise ICI (pas seulement dans
      // candidats()) : entre la sélection et cet UPDATE, une correction
      // manuelle a pu déjà changer cette ligne — 0 ligne affectée dans ce
      // cas, jamais un écrasement de decision humaine plus récente.
      const maj = await client.query(
        `update deals set categorie = $1 where id = $2 and categorie = 'Autre' returning id`,
        [nouvelle, row.id]
      );
      if (maj.rowCount !== 1) {
        sautees++;
        continue;
      }
      await client.query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'update_deal', 'deal', $2, $3)`,
        [
          UTILISATEUR_SYSTEME_ID,
          row.public_id,
          JSON.stringify({
            categorie: { avant: "Autre", apres: nouvelle },
            titre: row.titre,
            automatise: true,
            lot: RECATEGORISATION_LOT_ID,
          }),
        ]
      );
    }

    parCategorie[nouvelle] = (parCategorie[nouvelle] ?? 0) + 1;
    reclassements.push({ publicId: row.public_id, titre: row.titre, categorie: nouvelle });
  }

  return {
    total: rows.length,
    reclasses: reclassements.length,
    inchanges,
    sautees,
    parCategorie,
    actif,
    lotId: RECATEGORISATION_LOT_ID,
    reclassements,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
    process.exit(1);
  }

  const actif = process.env.RECATEGORISER_AUTRE_ACTIF === "true";

  console.log(
    actif
      ? "⚠️  MODE ACTIF — recatégorisation réelle."
      : "🔍 Mode à blanc (par défaut) — aucune écriture."
  );
  console.log(`Lot : ${RECATEGORISATION_LOT_ID} — périmètre : categorie='Autre', lien Bringo, non supprimé.`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log("🔌 Connecté à la base.");

    const resultat = await recategoriserAutre({ client, actif });

    console.log(`\n${actif ? "Recatégorisé" : "Serait recatégorisé"} : ${resultat.reclasses} / ${resultat.total} deal(s) "Autre".`);
    for (const [categorie, n] of Object.entries(resultat.parCategorie)) {
      console.log(`  - ${categorie} : ${n}`);
    }
    console.log(`Restent "Autre" (titre non concluant) : ${resultat.inchanges}`);
    if (resultat.sautees > 0) {
      console.log(`  (${resultat.sautees} ligne(s) sautée(s) — catégorie déjà changée par ailleurs entre-temps)`);
    }

    console.log("\n10 premiers exemples de reclassement :");
    for (const r of resultat.reclassements.slice(0, 10)) {
      console.log(`  [${r.publicId}] "${r.titre}" -> ${r.categorie}`);
    }
  } catch (err) {
    console.error("❌ Échec :", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
