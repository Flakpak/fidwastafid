// ============================================================
// FIDWASTAFID — Scraper ab-maroc.ma (Store API WooCommerce)
// Usage :
//   node scraper-ab-maroc.mjs
//
// Cible : GET https://ab-maroc.com/wp-json/wc/store/v1/products?on_sale=true
// — Store API WooCommerce publique, sans authentification, même famille que
// kiabi.ma/bestmark.ma déjà en production (docs/SPIKE-SOURCES.md §9,
// recontrôle du 14/08/2026 : ORANGE → VERT, faux négatif de la première
// passe qui s'était arrêtée à la page d'accueil sans chercher d'API).
//
// ⚠️ CATÉGORIE POSÉE EN DUR, MESURÉE PAS SUPPOSÉE : échantillon réel de 20
// produits remisés (14/08/2026) — 20/20 relèvent de l'outillage/bricolage/
// jardinage (INGCO, DINGQI, Nobel — perceuses, scies, souffleurs, pistolets
// à colle…), aucun autre domaine observé. Site mono-domaine, même schéma que
// scraper-decathlon.mjs (CATEGORIE fixe) — PAS mapCategorie() ici : le titre
// d'un souffleur de jardin ("aspirateur") matcherait à tort la règle
// Électroménager de categoriser.mjs, pensée pour un catalogue généraliste
// (bringo/carrefour), pas pour de l'outillage extérieur.
//
// ⚠️ PRIX EN SOUS-UNITÉ (centimes) : `prices.regular_price`/`sale_price` sont
// des chaînes ("54900"), `prices.currency_minor_unit` (=2, vérifié) donne le
// nombre de décimales — cf. _lib/wooStoreApi.mjs, prixDepuisCentimes().
//
// date_fin : `date_on_sale_to` — absent sur les 20 produits de l'échantillon
// du 14/08/2026 (aucune date de fin programmée côté site à cette date).
// Repli sur null si absent/invalide, JAMAIS silencieux (compté et journalisé
// en fin de run, même convention que scraper-carrefour.mjs).
//
// Prérequis prod : l'enseigne `ab-maroc` doit exister en base
// (docs/RUNBOOK-donnees.md, `ajouter-enseigne`) — sinon insert-deals.mjs
// rejette proprement chaque deal (enseigne inconnue), sans erreur.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { prixDepuisCentimes, dateFinDepuisISO } from "./_lib/wooStoreApi.mjs";

const URL_BASE = "https://ab-maroc.com/wp-json/wc/store/v1/products";
const ENSEIGNE = "ab-maroc";
const CATEGORIE = "Bricolage & Jardin"; // mono-domaine, mesuré — voir en-tête
const VILLE = "National";
const PAR_PAGE = 100; // maximum accepté par la Store API WooCommerce
const MAX_PAGES = 30; // garde-fou anti-boucle infinie ; 544 produits / 100 ≈ 6 pages au 14/08/2026
const THROTTLE_MS = 1000;

async function fetchPage(page) {
  const url = `${URL_BASE}?on_sale=true&per_page=${PAR_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const totalPages = Number(res.headers.get("x-wp-totalpages")) || 1;
  const produits = await res.json();
  return { produits, totalPages };
}

/**
 * Transforme une page de produits Store API en deals au format pipeline.
 * Fonction pure (aucun réseau) — c'est elle que couvrent les tests.
 * Retourne { deals, rejets, dateFinManquante }.
 */
export function parseProduits(produits) {
  const deals = [];
  const rejets = [];
  let dateFinManquante = 0;

  for (const p of produits || []) {
    const titre = (p?.name || "").replace(/&#8211;/g, "-").trim();
    if (titre.length < 3) {
      rejets.push({ nom: p?.slug || "(sans titre)", raison: "titre absent ou trop court" });
      continue;
    }

    const prixPromo = prixDepuisCentimes(p?.prices?.sale_price, p?.prices?.currency_minor_unit);
    const prixNormal = prixDepuisCentimes(p?.prices?.regular_price, p?.prices?.currency_minor_unit);
    if (prixPromo === null || prixPromo <= 0) {
      rejets.push({ nom: titre, raison: "prix promo (sale_price) absent ou non numérique" });
      continue;
    }
    if (prixNormal === null || prixNormal <= 0) {
      rejets.push({ nom: titre, raison: "prix normal (regular_price) absent ou non numérique" });
      continue;
    }
    if (prixNormal <= prixPromo) {
      rejets.push({ nom: titre, raison: `prix incohérent (normal ${prixNormal} <= promo ${prixPromo})` });
      continue;
    }

    if (!p?.permalink) {
      rejets.push({ nom: titre, raison: "permalink absent — lien produit non constructible" });
      continue;
    }

    const dateFin = dateFinDepuisISO(p?.date_on_sale_to);
    if (dateFin === null) dateFinManquante++;

    deals.push({
      titre,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie: CATEGORIE,
      description: null,
      photo_url: p?.images?.[0]?.src || null,
      lien: p.permalink,
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
    console.log(`📄 Page ${pageNum} : ${URL_BASE}?on_sale=true&per_page=${PAR_PAGE}&page=${pageNum}`);

    let produits, totalPages;
    try {
      ({ produits, totalPages } = await fetchPage(pageNum));
    } catch (err) {
      if (pageNum === 1) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
      console.log(`   ::warning::page ${pageNum} en échec (${err.message}) — arrêt de la pagination.`);
      break;
    }

    const { deals, rejets, dateFinManquante } = parseProduits(produits);
    totalProduits += produits.length;
    totalRejets += rejets.length;
    totalDateFinManquante += dateFinManquante;
    tousDeals.push(...deals);
    console.log(`   ${produits.length} produit(s) | ${deals.length} remisé(s) retenu(s) | ${rejets.length} écarté(s)`);

    if (pageNum >= totalPages) {
      console.log(`   (dernière page du catalogue : ${totalPages} page(s) au total)`);
      break;
    }
    if (pageNum < MAX_PAGES) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  if (totalDateFinManquante > 0) {
    console.log(
      `   ::warning::${totalDateFinManquante} deal(s) sans date_on_sale_to exploitable — date_fin=null en repli.`
    );
  }

  const now = new Date().toISOString();
  const deals = tousDeals.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_ab_maroc",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_ab-maroc.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) ab-maroc.ma retenu(s) sur ${totalProduits} produit(s) | ${totalRejets} écarté(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
