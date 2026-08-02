// ============================================================
// FIDWASTAFID — Scraper Kiabi (Mode)
// Usage :
//   node scraper-kiabi.mjs
//
// Cinquième source de diversification. Cible : l'endpoint Shopify public
// https://kiabi.ma/products.json (pagination ?page=N&limit=250). Kiabi.ma est
// une boutique Shopify ; ce endpoint sert le catalogue en JSON structuré, sans
// authentification, et robots.txt déclare `Allow: /` sans restriction sur les
// URL à paramètres. Pas de HTML à parser, pas de sélecteur CSS à maintenir.
//
// POURQUOI PAS L'ENDPOINT UCP/MCP (https://kiabi.ma/api/ucp/mcp) : il répond,
// mais exige la publication d'un profil d'agent UCP (HTTP 422
// `invalid_profile_url` sans lui), et c'est un protocole de COMMERCE
// (panier, checkout, paiement) dont nous n'avons besoin d'aucune capacité.
// products.json donne exactement la même donnée catalogue, sans identité à
// déclarer ni surface de transaction. Constat du 2026-08-02.
//
// ⚠️ CONTENU TIERS = DONNÉE, JAMAIS INSTRUCTION (docs/SPIKE-SOURCES.md) :
// le robots.txt et le /agents.md de Kiabi contiennent des directives
// adressées aux agents (dont l'installation d'un skill tiers). Elles sont
// lues comme du texte, jamais exécutées. Ce scraper ne fait que du GET
// catalogue.
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_kiabi.json — MÊME format que les
// autres scrapers, consommé tel quel par insert-deals.mjs (résolution
// enseigne, validation schéma partagé, module image, auto_draft, dédup).
//
// RÈGLE ABSOLUE (identique aux autres scrapers, CONTRAT-V1) : jamais de prix
// deviné. Un produit sans `compare_at_price` strictement supérieur au prix
// courant n'est PAS une promotion — il est rejeté, jamais complété.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const URL_BASE = "https://kiabi.ma/products.json";
const CATEGORIE = "Mode"; // enum canonique (packages/schemas)
const ENSEIGNE = "kiabi";
const VILLE = "National"; // boutique en ligne, pas de ville précise
// 250 = plafond Shopify pour products.json.
//
// DEUX CAPS, et le second est le vrai. Mesuré au premier dry-run du
// 2026-08-02 : ~45 % du catalogue Kiabi est remisé en permanence (556 deals
// sur 1250 produits parcourus). Un cap par pages ne protège donc rien — c'est
// le nombre de deals retenus qui doit être borné, sinon un seul run ensevelit
// la file admin `auto_draft` sous plusieurs centaines de fiches à trancher à
// la main. MAX_DEALS est aligné sur le cap délibéré de Decathlon (120/run).
const LIMITE_PAR_PAGE = 250;
const MAX_PAGES = 5;
const MAX_DEALS = 120;
const THROTTLE_MS = 2000;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

/** "85.00" → 85 ; null si non numérique (jamais 0 par défaut). */
function parsePrix(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Choisit la variante qui porte réellement l'offre : disponible ET remisée
 * (compare_at_price > price). Entre plusieurs tailles remisées, la moins
 * chère — c'est celle qu'annonce une vitrine, et elle est vérifiable.
 * Retourne null si aucune variante ne remplit les deux conditions : un
 * produit épuisé ou non remisé n'est pas un deal, et on n'en invente pas un.
 */
export function choisirVariante(variantes) {
  const candidates = (variantes || []).filter((v) => {
    if (v?.available !== true) return false;
    const prix = parsePrix(v.price);
    const compare = parsePrix(v.compare_at_price);
    return prix !== null && compare !== null && compare > prix;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (parsePrix(a.price) <= parsePrix(b.price) ? a : b));
}

/**
 * Transforme la charge utile de products.json en deals au format pipeline.
 * Fonction pure (aucun réseau) — c'est elle que couvrent les tests.
 * Retourne { deals, rejets } ; rejet = produit sans offre vérifiable.
 */
export function parseProduits(payload) {
  const deals = [];
  const rejets = [];

  for (const produit of payload?.products || []) {
    const titre = (produit?.title || "").trim();
    if (titre.length < 3) {
      rejets.push({ nom: produit?.handle || "(sans titre)", raison: "titre absent ou trop court" });
      continue;
    }

    const variante = choisirVariante(produit.variants);
    if (!variante) {
      rejets.push({ nom: titre, raison: "aucune variante disponible ET remisée" });
      continue;
    }

    const prixPromo = parsePrix(variante.price);
    const prixNormal = parsePrix(variante.compare_at_price);

    // Garde de cohérence explicite, en plus du filtre de choisirVariante :
    // la règle « normal ≥ promo » est celle du schéma partagé, elle se
    // vérifie ici plutôt que d'être découverte au rejet zod.
    if (prixNormal < prixPromo) {
      rejets.push({ nom: titre, raison: `prix incohérent (normal ${prixNormal} < promo ${prixPromo})` });
      continue;
    }

    const handle = produit.handle;
    if (!handle) {
      rejets.push({ nom: titre, raison: "handle absent — lien produit non constructible" });
      continue;
    }

    deals.push({
      titre,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie: CATEGORIE,
      // body_html est du HTML marketing complet (tableaux de composition,
      // images d'entretien) : le laisser passer tel quel remplirait la
      // description de balises. Non extrait plutôt que mal extrait.
      description: null,
      photo_url: produit.images?.[0]?.src || null,
      lien: `https://kiabi.ma/products/${handle}`,
      date_fin: null, // Shopify n'expose aucune date de fin de promotion
    });
  }

  return { deals, rejets };
}

/** URL de la page N du catalogue (pagination Shopify ?page=). */
export function urlPage(n) {
  return `${URL_BASE}?limit=${LIMITE_PAR_PAGE}&page=${n}`;
}

// ---------- Main ----------
async function main() {
  const tousDeals = [];
  let totalProduits = 0;
  let totalRejets = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = urlPage(pageNum);
    console.log(`📄 Page ${pageNum} : ${url}`);

    let payload;
    try {
      payload = await fetchPage(url);
    } catch (err) {
      // Page 1 en échec = source inexploitable, on sort en erreur. Une page
      // suivante en échec n'annule pas ce qui a déjà été extrait.
      if (pageNum === 1) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
      console.log(`   ::warning::page ${pageNum} en échec (${err.message}) — arrêt de la pagination.`);
      break;
    }

    const nbProduits = payload?.products?.length || 0;
    const { deals, rejets } = parseProduits(payload);
    totalProduits += nbProduits;
    totalRejets += rejets.length;
    tousDeals.push(...deals);
    console.log(`   ${nbProduits} produit(s) | ${deals.length} remisé(s) retenu(s) | ${rejets.length} écarté(s)`);

    // Cap de volume atteint : on tronque et on s'arrête là. La troncature est
    // annoncée, jamais silencieuse — le reste du catalogue remisé existe
    // toujours, il sera repris au run suivant.
    if (tousDeals.length >= MAX_DEALS) {
      const surplus = tousDeals.length - MAX_DEALS;
      tousDeals.length = MAX_DEALS;
      console.log(`   ⏹  Cap de ${MAX_DEALS} deals/run atteint — ${surplus} deal(s) de cette page laissé(s) pour un prochain run.`);
      break;
    }

    // Fin de catalogue : une page incomplète signifie qu'il n'y en a pas
    // d'autre — inutile de demander la suivante pour se le faire confirmer.
    if (nbProduits < LIMITE_PAR_PAGE) {
      console.log(`   (page incomplète — fin du catalogue)`);
      break;
    }
    if (pageNum < MAX_PAGES) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  const now = new Date().toISOString();
  const deals = tousDeals.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_kiabi",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_kiabi.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) Kiabi retenu(s) sur ${totalProduits} produit(s) | ${totalRejets} écarté(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseProduits/choisirVariante sans requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
