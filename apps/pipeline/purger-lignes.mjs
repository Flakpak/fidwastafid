// ============================================================
// FIDWASTAFID — Purge automatique des lignes (lot 5, plan « suppression
// administrative des deals ») — EN SUPPRESSION DOUCE, jamais un DELETE
// Usage : node purger-lignes.mjs
//
// Automatise ce que lot 1 rend possible à la main : poser `supprime_le` sur
// les lignes dormantes qui n'ont jamais été publiées. Reste réversible —
// contrairement à lot 4 (purge d'images), aucun geste irréversible ici :
// une ligne soft-supprimée par ce script se restaure exactement comme une
// ligne soft-supprimée à la main (POST .../restaurer, lot 1).
//
// PÉRIMÈTRE — deux exclusions volontaires, PAS les 1490 purgeables de la
// classification lot 3 :
//   - `expire` EXCLU : CONTRAT-V1 §1 grave « URL vivante à vie, jamais de
//     suppression » pour un deal expiré — c'est un actif SEO indexé. Un
//     admin peut déjà le supprimer à la main (lot 1) ; l'automatiser à
//     l'échelle contredirait l'esprit de cette règle gravée. Décision
//     explicite du 05/08/2026, PAS une omission.
//   - `en_attente` EXCLU : file de modération humaine active. Le supprimer
//     automatiquement ferait disparaître une soumission jamais jugée, sans
//     qu'aucun humain ne l'ait vue — contredit la raison d'être de la file.
//     Ne concerne que 2 lignes aujourd'hui (négligeable en volume, pas en
//     principe).
//
// Périmètre retenu : `rejete` et `auto_draft`, jamais publiés
// (`deals_protection.protege = false`, lot 3, même repli protecteur —
// tout doute protège), dormants depuis DELAI_JOURS_PURGE_LIGNES jours
// (`created_at`). En pratique, `auto_draft` s'auto-expire déjà en `expire`
// après 14 jours (expirer-auto-draft.mjs) — un `auto_draft` encore présent
// après ce délai est donc rarissime, mais pas structurellement exclu ici.
//
// DÉSARMÉ PAR DÉFAUT (PURGE_LIGNES_ACTIF, même convention que
// purger-images.mjs) : rapporte — combien de lignes, par statut — sans
// écrire. PURGE_LIGNES_DELAI_JOURS permet de simuler un autre délai (0 =
// « aujourd'hui ») sans jamais changer PURGE_LIGNES_ACTIF.
//
// Contrairement à purger-images.mjs, l'action elle-même (poser
// `supprime_le`) est un SEUL UPDATE atomique — pas de risque de « moitié
// faite » façon Storage-puis-marqueur. Le seul cas non nominal réaliste est
// bénin : la ligne a changé d'état entre la sélection et l'écriture (déjà
// supprimée par ailleurs entre-temps) — l'UPDATE porte sa propre garde
// (`supprime_le is null`) et affecte alors 0 ligne ; ce n'est pas une
// destruction ratée (rien n'a été détruit), donc pas une raison d'arrêter
// tout le run — journalisé, sauté, le run continue.
//
// journal_audit : réutilise l'action `supprimer_deal` (déjà dans la liste
// fermée non-probante de deals_protection, migration 0015) — même fait
// qu'un DELETE manuel, `details.automatise: true` fait la différence.
// Inventer une action distincte aurait exigé une nouvelle migration pour
// l'ajouter à cette liste fermée (repli protecteur sinon), sans bénéfice :
// c'est exactement le même fait côté domaine.
// ============================================================

import pg from "pg";
import { UTILISATEUR_SYSTEME_ID } from "./_lib/utilisateurSysteme.mjs";

/** Dormance minimale avant suppression douce automatique — cf. en-tête. */
export const DELAI_JOURS_PURGE_LIGNES = 60;

/** Statuts éligibles — expire et en_attenteExCLUS, cf. en-tête. */
const STATUTS_ELIGIBLES = ["rejete", "auto_draft"];

async function candidats(client, delaiJours) {
  const { rows } = await client.query(
    `select d.id, d.public_id, d.titre, d.statut, d.created_at
       from deals d
       join deals_protection dp on dp.public_id = d.public_id
      where d.supprime_le is null
        and d.statut = any($2::text[])
        and d.created_at < now() - make_interval(days => $1)
        and dp.protege = false
      order by d.created_at asc`,
    [delaiJours, STATUTS_ELIGIBLES]
  );
  return rows;
}

/**
 * `client` : pg.Client OU pg.Pool (même remarque que purger-images.mjs).
 * @param {{ client: pg.Client | pg.Pool, delaiJours?: number, actif?: boolean }} options
 * @returns {Promise<{ lignes: number, parStatut: Record<string, number>, sautees: number, actif: boolean, delaiJours: number, traites: Array<{publicId: string, titre: string, statut: string}> }>}
 */
export async function purgerLignes({ client, delaiJours = DELAI_JOURS_PURGE_LIGNES, actif = false }) {
  const rows = await candidats(client, delaiJours);

  const parStatut = {};
  const traites = [];
  let sautees = 0;

  for (const row of rows) {
    if (actif) {
      // Garde `supprime_le is null` reprise ICI (pas seulement dans
      // candidats()) : entre la sélection et cet UPDATE, une autre voie
      // (bouton admin, autre run) a pu déjà supprimer cette ligne — 0 ligne
      // affectée dans ce cas, jamais une erreur (rien n'a été détruit).
      const maj = await client.query(
        `update deals set supprime_le = now() where id = $1 and supprime_le is null returning id`,
        [row.id]
      );
      if (maj.rowCount !== 1) {
        sautees++;
        continue;
      }
      await client.query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'supprimer_deal', 'deal', $2, $3)`,
        [
          UTILISATEUR_SYSTEME_ID,
          row.public_id,
          JSON.stringify({ titre: row.titre, statutAvant: row.statut, automatise: true, delaiJours }),
        ]
      );
    }

    parStatut[row.statut] = (parStatut[row.statut] ?? 0) + 1;
    traites.push({ publicId: row.public_id, titre: row.titre, statut: row.statut });
  }

  return { lignes: traites.length, parStatut, sautees, actif, delaiJours, traites };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
    process.exit(1);
  }

  const actif = process.env.PURGE_LIGNES_ACTIF === "true";
  const delaiJours = process.env.PURGE_LIGNES_DELAI_JOURS
    ? Number(process.env.PURGE_LIGNES_DELAI_JOURS)
    : DELAI_JOURS_PURGE_LIGNES;

  if (!Number.isFinite(delaiJours) || delaiJours < 0) {
    console.error(`Erreur : PURGE_LIGNES_DELAI_JOURS invalide ("${process.env.PURGE_LIGNES_DELAI_JOURS}").`);
    process.exit(1);
  }

  console.log(actif ? "⚠️  MODE ACTIF — suppression douce réelle." : "🔍 Mode à blanc (par défaut) — aucune écriture.");
  console.log(`Délai : ${delaiJours} jour(s) depuis created_at. Statuts éligibles : ${STATUTS_ELIGIBLES.join(", ")}.`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log("🔌 Connecté à la base.");

    const resultat = await purgerLignes({ client, delaiJours, actif });

    for (const t of resultat.traites) {
      console.log(`  🗑️  [${t.publicId}] ${t.statut} — "${t.titre}"`);
    }

    console.log(`\n${actif ? "Supprimé (doux)" : "Serait supprimé (doux)"} : ${resultat.lignes} ligne(s).`);
    for (const [statut, n] of Object.entries(resultat.parStatut)) {
      console.log(`  - ${statut} : ${n}`);
    }
    if (resultat.sautees > 0) {
      console.log(`  (${resultat.sautees} ligne(s) sautée(s) — déjà supprimée(s) par ailleurs entre-temps)`);
    }
  } catch (err) {
    console.error("❌ Échec :", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
