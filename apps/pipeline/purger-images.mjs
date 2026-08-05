// ============================================================
// FIDWASTAFID — Purge d'images de deals supprimés (lot 4, plan « suppression
// administrative des deals »)
// Usage : node purger-images.mjs
//
// Le seul geste irréversible de tout le dispositif : contrairement à
// deals.supprime_le (lot 1, annulable par restauration) et
// memoire_curation.levee_le (lot 2, annulable par levée), un fichier
// réellement effacé du Storage ne revient pas. D'où deux garde-fous, tous
// deux dans CE script (pas dans la migration, qui ne fait que poser la
// colonne marqueur) :
//
//   1. DÉLAI DE 90 JOURS après supprime_le, pas 30 — l'artefact de backup
//      GitHub ne vit que 30 jours (db-backup.yml). Purger à 30 jours
//      créerait une fenêtre où un deal redevenu restaurable aurait déjà son
//      image irrécupérable, y compris depuis le seul filet de sécurité
//      existant : une restauration incomplète et silencieuse.
//   2. DOUBLE CONDITION, jamais une seule : `supprime_le is not null` ET
//      `deals_protection.protege = false` (lot 3, repli protecteur — tout
//      doute sur une éventuelle publication protège le deal, jamais
//      l'inverse).
//
// DÉSARMÉ PAR DÉFAUT (variable d'env PURGE_IMAGES_ACTIF, absente ou
// différente de "true" -> mode à blanc) : le job RAPPORTE ce qu'il
// supprimerait — nombre de fichiers, volume total — mais n'efface RIEN sur
// le Storage, ne pose AUCUNE date sur image_purgee_le, n'écrit AUCUNE ligne
// au journal d'audit. L'activation est une décision séparée, portée par le
// paramètre `actif` du déclenchement manuel du workflow (jamais par un
// cron qui tournerait déjà) — voir .github/workflows/purge-images.yml.
//
// PURGE_IMAGES_DELAI_JOURS permet de simuler un autre délai (ex. 0, pour
// « qu'est-ce que je supprimerais aujourd'hui si le délai était nul ») sans
// jamais sortir du mode à blanc par défaut : ce réglage ne touche que la
// sélection des candidats, jamais PURGE_IMAGES_ACTIF.
//
// image_key n'est JAMAIS effacé, ni par ce script ni par la migration 0016 :
// seule image_purgee_le fait foi de ce qui est réellement récupérable
// (apps/web/src/app/api/v1/_lib/deals.ts, toDeal()).
//
// Attribution journal_audit : l'utilisateur système « Pipeline »
// (00000000-0000-0000-0000-000000000001, migration 0016) — ce script ne
// tourne jamais pour le compte d'un admin humain.
//
// Prérequis : DATABASE_URL toujours. SUPABASE_URL + SUPABASE_SECRET_KEY
// uniquement s'il existe au moins un candidat (mêmes variables que
// apps/pipeline/images.mjs, même en-tête `apikey`).
// ============================================================

import pg from "pg";

/** 90 jours après supprime_le — cf. justification en tête de fichier. */
export const DELAI_JOURS_PURGE_IMAGES = 90;

export const UTILISATEUR_SYSTEME_ID = "00000000-0000-0000-0000-000000000001";

const BUCKET = "deals-images";

function storageAuthHeaders() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey };
}

function storageDisponible() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/**
 * Taille du fichier en octets via HEAD — best effort : un fichier déjà
 * absent (404) ou un en-tête Content-Length omis ne bloque jamais le
 * rapport, ils comptent pour un volume inconnu (null), jamais une erreur
 * fatale. La suppression elle-même (supprimerFichier) est plus stricte :
 * un échec là doit faire échouer le run.
 */
async function tailleFichier(cle) {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${cle}`;
  const res = await fetch(url, { method: "HEAD", headers: storageAuthHeaders() });
  if (!res.ok) return null;
  const len = res.headers.get("content-length");
  return len ? Number(len) : null;
}

async function supprimerFichier(cle) {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${cle}`;
  const res = await fetch(url, { method: "DELETE", headers: storageAuthHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`suppression storage ${res.status} pour "${cle}" : ${body.slice(0, 200)}`);
  }
}

/**
 * Candidats — double condition (lot 3 + lot 1), jointure sur la vue
 * `deals_protection` (migration 0015, lecture seule) plutôt qu'une
 * réimplémentation du critère : une seule vérité pour « ce deal a-t-il déjà
 * été publié ».
 */
async function candidats(client, delaiJours) {
  const { rows } = await client.query(
    `select d.id, d.public_id, d.image_key, d.supprime_le
       from deals d
       join deals_protection dp on dp.public_id = d.public_id
      where d.supprime_le is not null
        and d.supprime_le < now() - make_interval(days => $1)
        and d.image_purgee_le is null
        and d.image_key is not null
        and dp.protege = false
      order by d.supprime_le asc`,
    [delaiJours]
  );
  return rows;
}

/**
 * `client` : pg.Client OU pg.Pool, indifféremment — mêmes signatures de
 * `.query()` (même remarque que `traiterImage()`, images.mjs). Les tests
 * d'intégration (apps/web/tests/integration.ts) appellent cette fonction
 * directement avec le Pool partagé de @fidwastafid/db.
 * @param {{ client: pg.Client | pg.Pool, delaiJours?: number, actif?: boolean }} options
 * @returns {Promise<{ fichiers: number, octets: number, octetsInconnus: number, actif: boolean, delaiJours: number, traites: Array<{publicId: string, imageKey: string, octets: number|null}> }>}
 */
export async function purgerImages({ client, delaiJours = DELAI_JOURS_PURGE_IMAGES, actif = false }) {
  const rows = await candidats(client, delaiJours);

  let octets = 0;
  let octetsInconnus = 0;
  const traites = [];

  for (const row of rows) {
    let taille = null;
    if (storageDisponible()) {
      taille = await tailleFichier(row.image_key);
    }
    if (taille === null) octetsInconnus++;
    else octets += taille;

    traites.push({ publicId: row.public_id, imageKey: row.image_key, octets: taille });

    if (actif) {
      await supprimerFichier(row.image_key);
      await client.query("update deals set image_purgee_le = now() where id = $1", [row.id]);
    }
  }

  return { fichiers: traites.length, octets, octetsInconnus, actif, delaiJours, traites };
}

async function ecrireJournalAudit(client, resultat) {
  await client.query(
    `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
     values ($1, 'purger_images', 'deals_purge', null, $2)`,
    [
      UTILISATEUR_SYSTEME_ID,
      JSON.stringify({
        fichiers: resultat.fichiers,
        octets: resultat.octets,
        octetsInconnus: resultat.octetsInconnus,
        delaiJours: resultat.delaiJours,
        publicIds: resultat.traites.map((t) => t.publicId),
      }),
    ]
  );
}

function formatOctets(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// Exécution directe uniquement (import depuis les tests sans lancer le job).
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
    process.exit(1);
  }

  const actif = process.env.PURGE_IMAGES_ACTIF === "true";
  const delaiJours = process.env.PURGE_IMAGES_DELAI_JOURS
    ? Number(process.env.PURGE_IMAGES_DELAI_JOURS)
    : DELAI_JOURS_PURGE_IMAGES;

  if (!Number.isFinite(delaiJours) || delaiJours < 0) {
    console.error(`Erreur : PURGE_IMAGES_DELAI_JOURS invalide ("${process.env.PURGE_IMAGES_DELAI_JOURS}").`);
    process.exit(1);
  }

  console.log(actif ? "⚠️  MODE ACTIF — suppression réelle." : "🔍 Mode à blanc (par défaut) — aucune écriture.");
  console.log(`Délai : ${delaiJours} jour(s) après supprime_le.`);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log("🔌 Connecté à la base.");

    const resultat = await purgerImages({ client, delaiJours, actif });

    for (const t of resultat.traites) {
      console.log(
        `  🗑️  [${t.publicId}] ${t.imageKey} — ${t.octets === null ? "taille inconnue" : formatOctets(t.octets)}`
      );
    }

    console.log(
      `${actif ? "✅ Purgé" : "Serait purgé"} : ${resultat.fichiers} fichier(s), ` +
        `${formatOctets(resultat.octets)}` +
        (resultat.octetsInconnus > 0 ? ` (+ ${resultat.octetsInconnus} de taille inconnue)` : "") +
        "."
    );

    if (actif && resultat.fichiers > 0) {
      await ecrireJournalAudit(client, resultat);
      console.log("📝 Écrit au journal d'audit.");
    }
  } catch (err) {
    console.error("❌ Échec :", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
