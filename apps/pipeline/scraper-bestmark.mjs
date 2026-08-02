// ============================================================
// FIDWASTAFID — Scraper Bestmark (High-Tech)
// Usage :
//   node scraper-bestmark.mjs
//
// Sixième source de diversification. Cible : l'API GraphQL Magento 2 publique
// de bestmark.ma (POST https://www.bestmark.ma/graphql, sans authentification
// — constaté le 2026-08-02).
//
// POURQUOI GRAPHQL PLUTÔT QUE LE HTML : le robots.txt de Bestmark interdit
// explicitement toute URL à paramètres (`Disallow: /*?*`), ce qui exclut la
// pagination et les filtres du catalogue HTML. GraphQL est une route POST
// sans query string : la pagination y vit dans le CORPS de la requête, pas
// dans l'URL. On respecte donc la règle à la lettre, et on obtient en prime
// des prix structurés (regular_price / final_price) au lieu de sélecteurs
// CSS à maintenir. L'alternative (sitemap.xml + une requête par fiche
// produit) aurait été ~900 requêtes pour la même donnée.
//
// ⚠️ VOLUME MESURÉ, À CONNAÎTRE AVANT D'EN ATTENDRE QUOI QUE CE SOIT :
// balayage complet du catalogue le 2026-08-02 — 865 produits parcourus,
// **1 seul remisé** (« Tiroir de Caisse », 750 → 630 MAD). Ce scraper est
// donc correct mais à très faible rendement en l'état ; il n'a d'intérêt que
// si Bestmark active de vraies promotions (soldes, opérations). C'est un
// constat, pas une estimation — cf. docs/SPIKE-SOURCES.md.
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_bestmark.json — MÊME format que les
// autres scrapers, consommé tel quel par insert-deals.mjs.
//
// RÈGLE ABSOLUE (identique aux autres scrapers, CONTRAT-V1) : jamais de prix
// deviné. Un produit dont le prix final égale le prix normal n'est pas une
// promotion — il est écarté, jamais complété.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const URL_GRAPHQL = "https://www.bestmark.ma/graphql";
const BASE_SITE = "https://www.bestmark.ma";
const CATEGORIE = "High-Tech"; // enum canonique (packages/schemas)
const ENSEIGNE = "bestmark";
const VILLE = "National"; // boutique en ligne, pas de ville précise
// Le catalogue visible fait ~865 produits, soit 9 pages de 100. Le cap à 12
// couvre l'ensemble avec de la marge, sans jamais devenir un crawl illimité.
const TAILLE_PAGE = 100;
const MAX_PAGES = 12;
const THROTTLE_MS = 2000;

/**
 * Requête catalogue. `filter: {price: {from: "1"}}` est le prédicat le plus
 * large accepté par Magento pour lister des produits sans terme de recherche
 * (l'API exige au moins un filtre) — il ne sélectionne pas les promotions,
 * c'est le tri final_price < regular_price qui le fait, côté client.
 */
export function requetePage(page) {
  return {
    query: `{
      products(filter: {price: {from: "1"}}, pageSize: ${TAILLE_PAGE}, currentPage: ${page}) {
        total_count
        items {
          name
          sku
          url_key
          url_suffix
          stock_status
          small_image { url }
          price_range {
            minimum_price {
              regular_price { value }
              final_price { value }
            }
          }
        }
      }
    }`,
  };
}

async function fetchPage(page) {
  const res = await fetch(URL_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
    body: JSON.stringify(requetePage(page)),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${URL_GRAPHQL} (page ${page})`);
  const json = await res.json();
  // GraphQL répond 200 même en erreur applicative : un `errors` non vide est
  // un échec, pas un détail — jamais avalé en silence.
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join(" | ")}`);
  }
  return json;
}

/** Nombre exploitable, ou null. Jamais 0 par défaut. */
function parsePrix(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Transforme une réponse GraphQL en deals au format pipeline.
 * Fonction pure (aucun réseau) — c'est elle que couvrent les tests.
 * Retourne { deals, rejets, nbProduits }.
 */
export function parseProduits(json) {
  const items = json?.data?.products?.items || [];
  const deals = [];
  const rejets = [];

  for (const item of items) {
    const titre = (item?.name || "").trim();
    if (titre.length < 3) {
      rejets.push({ nom: item?.sku || "(sans nom)", raison: "nom absent ou trop court" });
      continue;
    }

    const min = item?.price_range?.minimum_price;
    const prixNormal = parsePrix(min?.regular_price?.value);
    const prixPromo = parsePrix(min?.final_price?.value);

    if (prixNormal === null || prixPromo === null) {
      rejets.push({ nom: titre, raison: `prix manquant (promo=${prixPromo ?? "?"}, normal=${prixNormal ?? "?"})` });
      continue;
    }
    // Pas de remise = pas un deal. C'est le cas de l'écrasante majorité du
    // catalogue (mesuré : 864 sur 865) — écarté sans bruit d'erreur.
    if (prixPromo >= prixNormal) {
      rejets.push({ nom: titre, raison: "aucune remise (final = normal)" });
      continue;
    }
    // Un produit épuisé n'est pas une bonne affaire, même remisé.
    if (item.stock_status && item.stock_status !== "IN_STOCK") {
      rejets.push({ nom: titre, raison: `hors stock (${item.stock_status})` });
      continue;
    }
    if (!item.url_key) {
      rejets.push({ nom: titre, raison: "url_key absent — lien produit non constructible" });
      continue;
    }

    deals.push({
      titre,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie: CATEGORIE,
      description: null, // non exposée par cette requête ; jamais devinée
      photo_url: item.small_image?.url || null,
      // URL propre, sans query string : conforme au `Disallow: /*?*` du
      // robots.txt, et c'est l'URL canonique du produit côté Magento.
      lien: `${BASE_SITE}/${item.url_key}${item.url_suffix || ".html"}`,
      date_fin: null, // Magento n'expose pas la fin de la remise ici
    });
  }

  return {
    deals,
    rejets,
    nbProduits: items.length,
    // Magento renvoie une ERREUR (pas une page vide) au-delà de la dernière
    // page : la borne se lit donc dans total_count, elle ne se découvre pas
    // en cognant. Cf. la boucle de main().
    totalCount: json?.data?.products?.total_count ?? null,
  };
}

// ---------- Main ----------
async function main() {
  const tousDeals = [];
  let totalProduits = 0;
  let totalRejets = 0;

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    let json;
    try {
      json = await fetchPage(pageNum);
    } catch (err) {
      if (pageNum === 1) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
      console.log(`   ::warning::page ${pageNum} en échec (${err.message}) — arrêt de la pagination.`);
      break;
    }

    const { deals, rejets, nbProduits, totalCount } = parseProduits(json);
    totalProduits += nbProduits;
    totalRejets += rejets.length;
    tousDeals.push(...deals);
    console.log(`📄 Page ${pageNum} : ${nbProduits} produit(s) | ${deals.length} remisé(s) retenu(s)`);

    if (nbProduits === 0) {
      console.log(`   (page vide — fin du catalogue)`);
      break;
    }
    // Dernière page atteinte : on s'arrête AVANT de la dépasser. Demander la
    // page suivante ferait répondre une erreur GraphQL, qu'il faudrait
    // journaliser en avertissement à chaque run — un avertissement qui
    // survient toujours finit par ne plus être lu.
    if (totalCount !== null && pageNum >= Math.ceil(totalCount / TAILLE_PAGE)) {
      console.log(`   (dernière page du catalogue : ${totalCount} produit(s) annoncé(s))`);
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
    source_type: "scraper_bestmark",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_bestmark.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(
    `\n✅ ${deals.length} deal(s) Bestmark retenu(s) sur ${totalProduits} produit(s) | ${totalRejets} écarté(s)`
  );
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseProduits sans requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
