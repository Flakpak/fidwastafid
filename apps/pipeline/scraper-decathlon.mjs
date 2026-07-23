// ============================================================
// FIDWASTAFID — Scraper Decathlon (Sport)
// Usage :
//   npm install cheerio
//   node scraper-decathlon.mjs
//
// Quatrième source de diversification (spike docs/SPIKE-SOURCES.md du
// 22/07/2026, verdict ORANGE levé au reconstat du 23/07/2026), sur le modèle
// du scraper universparadiscount. Cible : la catégorie promotions native
// server-rendered https://www.decathlon.ma/5080-promotions (PAS
// /content/179-soldes, dont les widgets Alpine.js ne sont pas hydratés dans
// le HTML brut — cf. spike). Pagination ?page=N (robots.txt autorise cette
// catégorie, ses produits /p/… et ?page= ; seuls compte/panier/filtres/
// recherche sont Disallow). Images sur le CDN contents.mediadecathlon.com
// (robots 410 = aucune restriction déclarée).
//
// CLIENT HTTP : Node fetch/undici passe ici en 200 partout (testé au
// reconstat, 5 requêtes successives) — le blocage Cloudflare par empreinte
// TLS qui a fait abandonner mrbricolage NE se reproduit PAS. En-tête
// `x-bot: YES` présent (détection sans blocage, contenu servi complet).
//
// GARDE ANTI-POLLUTION (surcoût #1 du spike) : le spike avait observé un bug
// de cache inter-tenant (Decathlon servant parfois le contenu d'un AUTRE
// site sous une URL Decathlon valide). Non reproduit au reconstat (5 req.
// propres), mais pageEstDecathlon() vérifie AVANT parsing que chaque page
// est bien du Decathlon (titre + absence de marqueur étranger connu) —
// une page polluée est sautée avec ::warning::, jamais parsée.
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_decathlon.json — MÊME format que les
// autres scrapers, consommé tel quel par insert-deals.mjs (résolution
// enseigne, validation schéma partagé, module image, auto_draft, dédup).
//
// RÈGLE ABSOLUE (identique aux autres scrapers, CONTRAT-V1) : jamais de prix
// deviné. Une carte sans prix promo ET prix barré clairs et cohérents
// (normal ≥ promo) est REJETÉE — jamais complétée.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";

const URL_BASE = "https://www.decathlon.ma/5080-promotions";
const CATEGORIE = "Sport"; // enum canonique (packages/schemas)
const ENSEIGNE = "decathlon";
const VILLE = "National"; // catalogue national, pas de ville précise
// Cap délibéré : le catalogue promo fait ~66 pages (~1580 produits) ; on n'en
// scrape qu'une tranche par run pour ne pas noyer la file admin auto_draft
// (source secondaire) ni marteler le site. Throttle aligné sur Bringo.
const MAX_PAGES = 5;
const THROTTLE_MS = 2000;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/**
 * Garde anti-pollution (bug de cache inter-tenant du spike) : la page doit
 * être du Decathlon (titre) ET ne contenir aucun marqueur d'un autre tenant
 * connu de l'infra partagée. Une page qui échoue est sautée, jamais parsée —
 * on ne veut pas insérer sous l'enseigne "decathlon" le contenu d'un tiers.
 */
export function pageEstDecathlon(html) {
  const titre = (html.match(/<title>([^<]*)<\/title>/i) || ["", ""])[1];
  const titreOk = /decathlon/i.test(titre);
  const marqueurEtranger = /universparadiscount|parapharmacie|doppelherz|PrestaShop-[0-9a-f]{6}=/i.test(html);
  return titreOk && !marqueurEtranger;
}

/**
 * Prix Decathlon au format français — « 259,00 MAD », « 1 299,00 MAD », y
 * compris précédé d'un texte lecteur d'écran (« Prix avant la réduction
 * 299,00 MAD »). Isole le premier motif nombre-virgule-2décimales, ignore le
 * reste. On parse le TEXTE affiché (précision complète) et jamais le
 * data-value de current-price, qui est tronqué à l'entier (259 pour 259,00).
 * null si aucun prix exploitable — jamais une valeur devinée.
 */
export function parsePrixDeca(texte) {
  if (!texte) return null;
  const m = texte.match(/(\d[\d\s]*),(\d{2})/);
  if (!m) return null;
  const entier = m[1].replace(/[\s]/g, "");
  const valeur = Number(`${entier}.${m[2]}`);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

/** URL image directe (CDN Decathlon). Le src n'est pas lazy-loadé ici (URL
 *  complète directement). Retient uniquement l'hôte CDN attendu — jamais une
 *  image d'un autre hôte (cohérent avec la garde anti-pollution). */
function extraireImage($card) {
  const src = $card.find("img").first().attr("src") || $card.find("img").first().attr("data-src") || "";
  return src.startsWith("https://contents.mediadecathlon.com/") ? src : null;
}

/**
 * Extrait les cartes remisées d'une page de listing. Sélecteurs (reconstat
 * du 23/07/2026) :
 *  - carte    : article.product-card
 *  - nom      : h2 (product-card_header)
 *  - promo    : [data-testid="current-price"]        (texte, ex. "259,00 MAD")
 *  - normal   : [data-testid="price-before-reduction"] (texte, préfixe
 *               .u-sr-only retiré, ex. "299,00 MAD")
 *  - image    : img[src] (CDN contents.mediadecathlon.com)
 *  - lien     : a[href*="/p/"]
 * Retourne { deals, rejets } — rejet = carte sans les deux prix cohérents.
 */
export function parseListing(html) {
  const $ = cheerio.load(html);
  const deals = [];
  const rejets = [];

  $("article.product-card").each((_, card) => {
    const $c = $(card);
    const nom = $c.find("h2").first().text().trim() || null;
    const lien = $c.find('a[href*="/p/"]').first().attr("href") || null;
    const prixPromo = parsePrixDeca($c.find('[data-testid="current-price"]').first().text());
    // Le prix barré porte un préfixe lecteur d'écran ("Prix avant la
    // réduction") : parsePrixDeca l'ignore (il n'extrait que le motif
    // nombre,décimales), mais on retire tout de même .u-sr-only par clarté.
    const $barre = $c.find('[data-testid="price-before-reduction"]').first().clone();
    $barre.find(".u-sr-only").remove();
    const prixNormal = parsePrixDeca($barre.text());
    const photoUrl = extraireImage($c);

    // Rejet prime sur invention (CONTRAT-V1) : les deux prix doivent être
    // présents, parseables et cohérents (normal ≥ promo). Une carte non
    // remisée (pas de prix barré) est rejetée, jamais complétée.
    if (!nom) {
      rejets.push({ nom: "(sans nom)", raison: "nom introuvable" });
      return;
    }
    if (prixPromo == null || prixNormal == null) {
      rejets.push({ nom, raison: `prix manquant (promo=${prixPromo ?? "?"}, normal=${prixNormal ?? "?"})` });
      return;
    }
    if (prixNormal < prixPromo) {
      rejets.push({ nom, raison: `prix incohérent (normal ${prixNormal} < promo ${prixPromo})` });
      return;
    }

    deals.push({
      titre: nom,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie: CATEGORIE,
      description: null, // pas de description exploitable sur les cartes du listing
      photo_url: photoUrl,
      lien,
      date_fin: null, // pas de date de fin exposée sur le listing
    });
  });

  return { deals, rejets };
}

/** URL de la page N du listing promos (pagination ?page=). */
function urlPage(n) {
  return n === 1 ? URL_BASE : `${URL_BASE}?page=${n}`;
}

// ---------- Main ----------
async function main() {
  let tous = [];
  let totalRejets = 0;
  let pagesPolluees = 0;
  const dejaVus = new Set(); // dédup intra-run par lien produit

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = urlPage(pageNum);
    console.log(`📄 Page ${pageNum} : ${url}`);

    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      if (pageNum === 1) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
      }
      console.log(`   (fin de pagination : ${err.message})`);
      break;
    }

    // Garde anti-pollution : ne jamais parser une page qui n'est pas du
    // Decathlon (bug de cache inter-tenant du spike).
    if (!pageEstDecathlon(html)) {
      pagesPolluees++;
      console.log(`   ::warning::page ignorée — contenu non-Decathlon détecté (cache inter-tenant ?)`);
      continue;
    }

    const { deals, rejets } = parseListing(html);
    const nouveaux = deals.filter((d) => !d.lien || !dejaVus.has(d.lien));
    if (deals.length === 0 || nouveaux.length === 0) {
      console.log("   (aucune carte nouvelle — fin de la pagination)");
      break;
    }
    nouveaux.forEach((d) => d.lien && dejaVus.add(d.lien));
    totalRejets += rejets.length;
    console.log(`   ${nouveaux.length} carte(s) retenue(s) | ${rejets.length} rejetée(s)`);
    tous = tous.concat(nouveaux);

    if (pageNum < MAX_PAGES) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  const now = new Date().toISOString();
  const deals = tous.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_decathlon",
    extrait_le: now,
  }));

  // Archivage daté : extractions/AAAA-MM-JJ_HH-mm_decathlon.json (non committé)
  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_decathlon.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) Decathlon retenu(s) | ${totalRejets} rejeté(s) | ${pagesPolluees} page(s) polluée(s) ignorée(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseListing/parsePrixDeca/pageEstDecathlon sans requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
