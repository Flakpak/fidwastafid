// ============================================================
// FIDWASTAFID — Insertion des deals extraits en base (schéma v2)
// Usage : node insert-deals.mjs deals-extraits.json
//
// Prérequis :
//   npm install pg
//   Variable d'env DATABASE_URL (connection string Postgres)
//   → Aujourd'hui : Supabase (Settings → Database → Connection string, URI)
//   → Demain VPS : postgres://user:pass@ton-vps-ovh:5432/fidwastafid
//   Le script ne change pas d'une ligne entre les deux.
//
// Adapté au schéma v2 (dépôt frère ../fidwastafid) :
//   - public_id généré ici (répliqué depuis packages/schemas/src/common.ts).
//   - magasin (texte libre) → enseigne_id résolu contre la table `enseignes`
//     réelle ; aucune correspondance = deal rejeté, jamais d'enseigne
//     inventée (CONTRAT-V1 §3, principe du pipeline étendu).
//   - photo_url ne va plus dans une colonne `photo_url` (retirée en v2) :
//     la colonne insérée est `image_key`, peuplée par le module image
//     (images.mjs, appelé après chaque insertion réussie ayant un
//     photo_url — voir traiterImage()). photo_url reste dans l'objet
//     deal en mémoire et dans les JSON d'archive produits par
//     scraper-bringo.mjs/extract-catalogue.mjs (non modifiés).
// ============================================================

import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import pg from "pg";
import { traiterImage, storageDisponible } from "./images.mjs";
import { extraireDescription } from "./fiche-produit.mjs";
import { validateDeal } from "./validation.mjs";
import { resoudreFichierArgument } from "./argv.mjs";

// ---------- Description depuis la fiche produit (Bringo uniquement) ----------
const BRINGO_LIEN_RE = /^https:\/\/(www\.)?bringo\.ma\//i;
const THROTTLE_FICHE_MS = 500;
let dernierFetchFiche = 0;

/** Throttle 500ms minimum entre deux requêtes de fiche produit (politesse). */
async function attendreThrottleFiche() {
  const attente = THROTTLE_FICHE_MS - (Date.now() - dernierFetchFiche);
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  dernierFetchFiche = Date.now();
}

// ---------- public_id (CONTRAT-V1 §1) ----------
// Alphabet et longueur répliqués tels quels depuis
// ../fidwastafid/packages/schemas/src/common.ts (PUBLIC_ID_ALPHABET,
// PUBLIC_ID_LENGTH) — nanoid restreint, sans caractères ambigus (0/o, 1/l),
// pour rester lisible retapé depuis un lien WhatsApp/SMS. Générateur répliqué
// à la main plutôt qu'une dépendance nanoid ajoutée à ce dossier autonome —
// même alphabet, même longueur, même source aléatoire cryptographique.
const PUBLIC_ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
const PUBLIC_ID_LENGTH = 10;
function generatePublicId() {
  let id = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    id += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return id;
}

// ---------- Configuration (adapter si tes valeurs CHECK diffèrent) ----------
const STATUT_AUTO = "auto_draft";   // doit être autorisé par la contrainte CHECK sur statut
const TYPE_DEFAUT = "physique";     // minuscule — imposé par deals_type_check
const VILLE_DEFAUT = "National";

const USAGE = "Usage : node insert-deals.mjs deals-extraits.json";
const resolution = resoudreFichierArgument(process.argv.slice(2), USAGE);
if (!resolution.ok) {
  console.error(`Erreur : ${resolution.message}`);
  process.exit(1);
}
const { fichier } = resolution;

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const deals = JSON.parse(readFileSync(fichier, "utf8"));

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Supabase exige SSL ; un Postgres local sur VPS n'en aura pas forcément.
  ssl: process.env.DATABASE_URL.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : false,
});

// ---------- Enseignes (magasin texte → enseigne_id) ----------
// Correspondance exacte (insensible casse/accents) sur le slug OU le nom
// de la table `enseignes` réelle, chargée au démarrage. Aucune valeur
// inventée : un magasin sans correspondance rejette le deal (cf. main).
function normaliser(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

async function chargerEnseignes(pgClient) {
  const { rows } = await pgClient.query("select id, slug, nom from enseignes");
  const map = new Map();
  for (const r of rows) {
    map.set(normaliser(r.slug), r.id);
    map.set(normaliser(r.nom), r.id);
  }
  // rows.length, pas map.size : slug et nom normalisent souvent à la même
  // clé (ex. "Carrefour"/"carrefour"), donc map.size sous-compte de façon
  // imprévisible selon les enseignes — rows.length est le vrai nombre de
  // lignes chargées.
  return { map, count: rows.length };
}

// ---------- Mapping extraction → schéma table deals (v2) ----------
// La catégorie n'est plus remappée localement (Phase 7A) : elle passe telle
// quelle à validateDeal() (validation.mjs, dealInputSchema partagé), qui
// rejette toute valeur hors de l'enum canonique — jamais de repli silencieux
// sur "Autre". Conséquence connue : les deals que scraper-bringo.mjs
// catégorise "Enfants" (absent de l'enum réel, mapCategorie() non modifiée
// dans ce lot — code du scraper inchangé) seront désormais rejetés plutôt
// qu'insérés sous une catégorie corrigée à la volée.
function mapDeal(d) {
  return {
    titre: d.titre?.trim().slice(0, 200),
    enseigneRaw: d.enseigne?.trim(),
    ville: d.ville || VILLE_DEFAUT,
    categorie: d.categorie,
    prix_promo: d.prix_promo,
    prix_normal: d.prix_normal, // nullable en base ; prixPromo seul est requis par le schéma partagé
    // 1000, pas 500 : aligné sur la troncature déjà propre (phrase/mot
    // complet) de fiche-produit.mjs — un second slice ici la couperait en
    // plein milieu. Sans rapport avec la limite du schéma (2000).
    description: d.description?.trim().slice(0, 1000) || null,
    // Gardée en mémoire pour le futur module image (lot suivant) — ne part
    // JAMAIS dans l'INSERT ci-dessous (image_key reste NULL dans ce lot).
    photo_url: d.photo_url || null,
    lien: d.lien || null,
    type: TYPE_DEFAUT,
    statut: STATUT_AUTO,
    score: 0,
    date_fin: d.date_fin || null,
  };
}

// ---------- Main ----------
try {
  await client.connect();
  console.log("🔌 Connecté à la base.");

  const { map: enseignes, count: nbEnseignes } = await chargerEnseignes(client);
  console.log(`🏷️  ${nbEnseignes} enseigne(s) chargée(s) depuis la base (par slug + nom).`);

  // Module image (CONTRAT-V1 §6) : jamais bloquant. Si SUPABASE_URL ou
  // SUPABASE_SECRET_KEY manquent (cf. storageDisponible() dans images.mjs),
  // le traitement image est sauté pour tout le run — les deals s'insèrent
  // quand même, image_key reste NULL.
  const imagesActivees = storageDisponible();
  const dealsAvecPhoto = deals.filter((d) => d.photo_url).length;
  if (dealsAvecPhoto > 0 && !imagesActivees) {
    console.log(
      `⚠️  SUPABASE_URL et/ou SUPABASE_SECRET_KEY manquant(s) — ` +
        `traitement image sauté pour les ${dealsAvecPhoto} deal(s) avec photo_url (image_key restera NULL).`
    );
  }

  let inseres = 0, doublons = 0, rejetes = 0, rejetesEnseigne = 0;
  let descriptionsObtenues = 0, descriptionsEchouees = 0;

  for (const raw of deals) {
    const d = mapDeal(raw);

    // Validation partagée (Phase 7A, packages/schemas — source de vérité
    // unique) : mêmes règles que la soumission communautaire (POST
    // /api/v1/deals). Remplace l'ancienne validation locale (présence
    // manuelle de titre/prix_promo/prix_normal) — un deal invalide est
    // rejeté et journalisé, jamais inséré avec une valeur devinée.
    const validation = validateDeal(d);
    if (!validation.ok) {
      rejetes++;
      console.log(`  ⤫ Rejeté (validation) : ${d.titre || raw.titre || "sans titre"} — ${validation.message}`);
      continue;
    }

    // Rejet si l'enseigne ne correspond à rien en base — jamais d'enseigne
    // inventée, jamais de null silencieux (le rejet prime sur l'invention).
    const enseigneId = enseignes.get(normaliser(d.enseigneRaw));
    if (!enseigneId) {
      rejetesEnseigne++;
      console.log(`  ⤫ Rejeté (enseigne "${d.enseigneRaw || "?"}" inconnue en base) : ${d.titre}`);
      continue;
    }

    const publicId = generatePublicId();

    // Déduplication : même titre + enseigne + prix, deal non expiré (même
    // logique qu'avant l'adaptation v2, magasin texte remplacé par
    // enseigne_id). Sans rapport avec la dédup par URL de scraper-bringo.mjs
    // (quirk pagination Sylius), qui reste inchangée dans ce fichier-là.
    const dup = await client.query(
      `SELECT id FROM deals
       WHERE lower(titre) = lower($1) AND enseigne_id = $2
         AND prix_promo = $3
         AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
       LIMIT 1`,
      [d.titre, enseigneId, d.prix_promo]
    );
    if (dup.rowCount > 0) {
      doublons++;
      continue;
    }

    // Description depuis la fiche produit — Bringo uniquement, jamais
    // bloquant (extraireDescription retourne null sur tout échec, cf.
    // fiche-produit.mjs). Fait après la dédup : pas de requête fiche
    // gaspillée sur un deal qu'on n'insère pas de toute façon.
    if (d.lien && BRINGO_LIEN_RE.test(d.lien)) {
      await attendreThrottleFiche();
      const description = await extraireDescription(d.lien);
      d.description = description;
      if (description) descriptionsObtenues++;
      else descriptionsEchouees++;
    }

    await client.query(
      `INSERT INTO deals
         (public_id, titre, enseigne_id, ville, categorie, type, prix_promo,
          prix_normal, description, lien, image_key, statut, score, date_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        publicId,
        d.titre,
        enseigneId,
        d.ville,
        d.categorie,
        d.type,
        d.prix_promo,
        d.prix_normal,
        d.description,
        d.lien,
        null, // image_key — réservé au futur module image (lot suivant)
        d.statut,
        d.score,
        d.date_fin,
      ]
    );
    inseres++;

    // Après insertion réussie uniquement — jamais sur un doublon (cf. le
    // `continue` plus haut, qui saute cette section). Périmètre Bringo
    // uniquement en pratique : seul scraper-bringo.mjs peuple photo_url.
    if (imagesActivees) {
      await traiterImage(d, publicId, client);
    }
  }

  console.log(
    `\n✅ Terminé : ${inseres} insérés | ${doublons} doublons ignorés | ` +
      `${rejetes} rejetés (validation) | ${rejetesEnseigne} rejetés (enseigne inconnue)`
  );
  if (descriptionsObtenues + descriptionsEchouees > 0) {
    console.log(
      `📄 Fiches produit : ${descriptionsObtenues} description(s) extraite(s) | ` +
        `${descriptionsEchouees} échec(s) (description restée null)`
    );
  }
  console.log(`→ Les deals sont en statut '${STATUT_AUTO}' : valide-les dans ton admin.`);
} catch (err) {
  console.error("❌ Échec :", err.message);
  if (err.message.includes("check constraint")) {
    console.error(
      "\n💡 Une contrainte CHECK a bloqué l'insertion (probablement 'statut')." +
      "\nVérifie tes contraintes avec la requête fournie, puis étends-les."
    );
  }
  process.exit(1);
} finally {
  await client.end();
}
