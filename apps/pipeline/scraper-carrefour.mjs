// ============================================================
// FIDWASTAFID — Scraper Carrefour.ma (API officielle)
// Usage :
//   node scraper-carrefour.mjs
//
// EN PARALLÈLE DE bringo.ma, PAS EN REMPLACEMENT (décision du 13/08/2026,
// docs/SPIKE-SOURCES.md §10) : bringo est la première source en volume,
// l'API découverte ici vient d'apparaître le jour même (site carrefour.ma
// tout juste redevenu joignable) — sa stabilité n'est pas prouvée. Perdre
// les deux serait le pire résultat. Ce scraper tourne à côté de bringo, une
// période de recouvrement mesure le taux de doublons réel avant toute
// décision de bascule.
//
// Cible : https://backend.carrefour.ma/api/products — API JSON publique,
// sans authentification, découverte par interception réseau (Playwright,
// une seule fois, en reconnaissance — jamais en production : un simple
// `fetch` suffit ici, comme kiabi/bestmark). robots.txt de carrefour.ma
// (sans `www`, qui ne résout pas en DNS) : `Allow: /` sans restriction.
//
// ⚠️ SÉMANTIQUE DES PRIX, VÉRIFIÉE EMPIRIQUEMENT, PAS SUPPOSÉE : l'API
// renvoie `price` (prix courant/promo) et `crossedPrice` (prix normal,
// barré). Mesuré sur 187 produits réels le 13/08/2026 : crossedPrice >
// price sur 162/187 lignes (remise réelle). Les 9 lignes où price >
// crossedPrice sont incohérentes (prix normal inférieur au prix promo) et
// rejetées ici — jamais de prix deviné (CONTRAT-V1).
//
// ⚠️ QUATRE ENSEIGNES DANS UNE SEULE ICI, DÉCISION EXPLICITE : l'API sert
// Carrefour, Carrefour Market, Carrefour Express et Carrefour Gourmet
// (`enseigne.name` par produit). Ce scraper les regroupe TOUTES sous
// `enseigne: "Carrefour"` — même enseigne_id que bringo.ma
// (scraper-bringo.mjs, ENSEIGNE="Carrefour") — DÉLIBÉRÉMENT, pour que le
// dédoublonnage titre+enseigne+prix d'insert-deals.mjs s'applique entre les
// deux sources sans amendement, et pour que la mesure de recouvrement
// demandée soit possible. Séparer les quatre enseignes en entités curées
// distinctes est une décision produit ultérieure, pas prise ici.
//
// date_fin RÉELLE, PREMIÈRE FOIS DANS CE PIPELINE : tous les autres
// scrapers (bringo, inwi, universparadiscount, decathlon, kiabi, bestmark)
// posent `date_fin: null` — aucune source précédente n'exposait de date de
// fin fiable. `promotionEndDate` (ISO 8601) est présent sur 178/187
// produits mesurés. Absent : repli sur `null` (même convention que les
// autres scrapers), JAMAIS silencieux — compté et journalisé en fin de run
// (cf. `dateFinManquante` dans le résumé).
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_carrefour.json — MÊME format que
// les autres scrapers, consommé tel quel par insert-deals.mjs. Le seuil de
// remise (remise.mjs, 30 %) s'applique là-bas, pas ici — comme pour toutes
// les sources.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { mapCategorie } from "./_lib/categoriser.mjs";

const URL_BASE = "https://backend.carrefour.ma/api/products";
const ENSEIGNE = "Carrefour"; // même enseigne_id que bringo — voir en-tête
const VILLE = "National"; // catalogue en ligne, pas de ville précise
const LIMITE_PAR_PAGE = 100;
// Garde-fou anti-boucle infinie, pas un cap éditorial : `pagination.totalPages`
// fait autorité, ce plafond ne devrait jamais être atteint en pratique
// (187 produits / 100 par page = 2 pages au 13/08/2026).
const MAX_PAGES = 20;
const THROTTLE_MS = 1000;

async function fetchPage(page) {
  const url = `${URL_BASE}?status=active&isPromotion=true&limit=${LIMITE_PAR_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

/** "2026-08-19T00:00:00.000Z" → "2026-08-19" ; null si absent/invalide. */
export function dateFinDepuisISO(iso) {
  if (!iso || typeof iso !== "string") return null;
  const jour = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/**
 * Transforme la charge utile de /api/products en deals au format pipeline.
 * Fonction pure (aucun réseau) — c'est elle que couvrent les tests.
 * Retourne { deals, rejets, dateFinManquante }.
 */
export function parseProduits(payload) {
  const deals = [];
  const rejets = [];
  let dateFinManquante = 0;

  for (const p of payload?.products || []) {
    const titre = (p?.name || "").trim();
    if (titre.length < 3) {
      rejets.push({ nom: p?.slug || "(sans titre)", raison: "titre absent ou trop court" });
      continue;
    }

    const prixPromo = Number(p?.price);
    const prixNormal = Number(p?.crossedPrice);
    if (!Number.isFinite(prixPromo) || prixPromo <= 0) {
      rejets.push({ nom: titre, raison: "prix promo absent ou non numérique" });
      continue;
    }
    if (!Number.isFinite(prixNormal) || prixNormal <= 0) {
      rejets.push({ nom: titre, raison: "prix normal (crossedPrice) absent ou non numérique" });
      continue;
    }
    // Sémantique vérifiée : crossedPrice (normal) doit dépasser price
    // (promo) STRICTEMENT. Les cas inverses (constatés, 9/187 le
    // 13/08/2026) sont incohérents — jamais de prix deviné, on écarte.
    if (prixNormal <= prixPromo) {
      rejets.push({ nom: titre, raison: `prix incohérent (normal ${prixNormal} <= promo ${prixPromo})` });
      continue;
    }

    if (!p?.slug) {
      rejets.push({ nom: titre, raison: "slug absent — lien produit non constructible" });
      continue;
    }

    const dateFin = dateFinDepuisISO(p?.promotionEndDate);
    if (dateFin === null) dateFinManquante++;

    // Nom de rayon carrefour.ma (nouvelle taxonomie, ex. "High-Tech &
    // Multimédia") passé comme repli à mapCategorie() — fonction déjà
    // partagée avec bringo (_lib/categoriser.mjs), pas une seconde copie
    // qui dériverait. Le champ legacy `primaryCategory` (majuscules,
    // hérité de la synchro Bringo) n'est pas utilisé ici : le titre suffit
    // dans la grande majorité des cas mesurés (mots-clés alimentaire/
    // beauté/high-tech déjà couverts par mapCategorie).
    const rayon = p?.category?.name || "";
    const categorie = mapCategorie("", titre, rayon);

    deals.push({
      titre,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie,
      description: null, // pas d'extraction de description ici (cf. bringo/fiche-produit.mjs, hors périmètre)
      photo_url: p?.mainImageUrl || null,
      lien: `https://carrefour.ma/produits/${p.slug}`,
      date_fin: dateFin,
    });
  }

  return { deals, rejets, dateFinManquante };
}

// ---------- Main ----------
async function main() {
  const tousDeals = [];
  let totalProduits = 0;
  let totalRejets = 0;
  let totalDateFinManquante = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    console.log(`📄 Page ${pageNum} : ${URL_BASE}?...&page=${pageNum}`);

    let payload;
    try {
      payload = await fetchPage(pageNum);
    } catch (err) {
      if (pageNum === 1) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
      console.log(`   ::warning::page ${pageNum} en échec (${err.message}) — arrêt de la pagination.`);
      break;
    }

    const nbProduits = payload?.products?.length || 0;
    const { deals, rejets, dateFinManquante } = parseProduits(payload);
    totalProduits += nbProduits;
    totalRejets += rejets.length;
    totalDateFinManquante += dateFinManquante;
    tousDeals.push(...deals);
    console.log(`   ${nbProduits} produit(s) | ${deals.length} remisé(s) retenu(s) | ${rejets.length} écarté(s)`);

    const { totalPages, hasNextPage } = payload?.pagination || {};
    if (!hasNextPage || (totalPages && pageNum >= totalPages)) {
      console.log(`   (dernière page du catalogue : ${payload?.pagination?.total ?? "?"} produit(s) annoncé(s) au total)`);
      break;
    }
    if (pageNum < MAX_PAGES) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  // Repli sur date_fin=null journalisé — jamais silencieux (cf. en-tête).
  if (totalDateFinManquante > 0) {
    console.log(
      `   ::warning::${totalDateFinManquante} deal(s) sans promotionEndDate exploitable — date_fin=null en repli (même convention que les autres scrapers).`
    );
  }

  const now = new Date().toISOString();
  const deals = tousDeals.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_carrefour",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_carrefour.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) Carrefour retenu(s) sur ${totalProduits} produit(s) | ${totalRejets} écarté(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseProduits/dateFinDepuisISO sans requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
