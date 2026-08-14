// ============================================================
// FIDWASTAFID — Scraper aswakassalam.com (Store API WooCommerce)
// Usage :
//   node scraper-aswakassalam.mjs
//
// Cible : GET https://aswakassalam.com/wp-json/wc/store/v1/products?on_sale=true
// — même Store API que ab-maroc.mjs (docs/SPIKE-SOURCES.md §9, recontrôle du
// 14/08/2026 : ORANGE stratégique → VERT confirmé). Aswak Assalam est une
// chaîne de supermarché marocaine — seule vraie piste vers la catégorie
// Alimentaire (0 deal publié en production au 14/08/2026).
//
// ⚠️ CATÉGORISATION PAR RAYON, PAS MONO-DOMAINE — À LA DIFFÉRENCE DE
// ab-maroc.mjs : échantillon réel de 30 produits remisés (14/08/2026) —
// alimentaire (ÉPICERIE, CRÈMERIE, BOISSONS, BISCUITERIE & CONFISERIE…),
// Maison & Cuisine, Beauté, Entretien, Animalerie observés dans le même run.
// Un supermarché généraliste, pas un spécialiste — reprendre la catégorie
// unique de ab-maroc.mjs classerait à tort tout le catalogue en Alimentaire,
// et coder du texte de titre uniquement (mapCategorie() sans rayon) manque
// des cas réels : "BOUCHEES AGNEAU POUR CHIEN ADULTE" ne porte aucun
// mot-clé alimentaire au sens du titre — c'est le rayon WooCommerce
// (`categories[].name`) qui porte le signal fiable. mapCategorie()
// (_lib/categoriser.mjs) a été étendue le 14/08/2026 avec les rayons
// alimentaires/beauté/maison réels de ce catalogue — voir son en-tête.
// Rayon absent de l'enum (ex. "ANIMALERIE", pas de catégorie Fidwastafid
// correspondante) → "Autre", jamais inventé.
//
// ⚠️ PRIX EN SOUS-UNITÉ (centimes), même convention que ab-maroc.mjs — voir
// _lib/wooStoreApi.mjs.
//
// date_fin : `date_on_sale_to` — absent sur l'échantillon du 14/08/2026,
// repli sur null journalisé, jamais silencieux.
//
// Prérequis prod : l'enseigne `aswakassalam` doit exister en base
// (docs/RUNBOOK-donnees.md, `ajouter-enseigne`) — sinon insert-deals.mjs
// rejette proprement chaque deal (enseigne inconnue), sans erreur.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { prixDepuisCentimes, dateFinDepuisISO } from "./_lib/wooStoreApi.mjs";
import { mapCategorie } from "./_lib/categoriser.mjs";

const URL_BASE = "https://aswakassalam.com/wp-json/wc/store/v1/products";
const ENSEIGNE = "aswakassalam";
const VILLE = "National";
const PAR_PAGE = 100;
const MAX_PAGES = 30; // garde-fou anti-boucle infinie ; 1053 produits / 100 ≈ 11 pages au 14/08/2026
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

    // Rayon = tous les noms de catégorie WooCommerce du produit, joints —
    // le plus spécifique (ex. "BOUCHERIE") comme le plus générique
    // (ex. "ÉPICERIE") sont passés, mapCategorie() teste ses motifs sur
    // l'ensemble sans distinction d'ordre.
    const rayon = (p?.categories || []).map((c) => c?.name || "").join(" ");
    const categorie = mapCategorie("", titre, rayon);

    deals.push({
      titre,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie,
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
    source_type: "scraper_aswakassalam",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_aswakassalam.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) aswakassalam.com retenu(s) sur ${totalProduits} produit(s) | ${totalRejets} écarté(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
