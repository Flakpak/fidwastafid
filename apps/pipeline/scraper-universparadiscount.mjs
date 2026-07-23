// ============================================================
// FIDWASTAFID — Scraper Univers Para Discount (Beauté)
// Usage :
//   npm install cheerio
//   node scraper-universparadiscount.mjs
//
// Troisième source de diversification (spike docs/SPIKE-SOURCES.md du
// 22/07/2026, verdict ORANGE levé au reconstat du 23/07/2026), sur le
// modèle direct du scraper inwi. Cible : la HOMEPAGE
// https://universparadiscount.ma/ — elle agrège en une seule requête les
// produits remisés de ses carrousels (94 uniques au reconstat), ce qui
// lève le surcoût ORANGE « pas de page promo stable » du spike (le scan
// catalogue n'est pas nécessaire ; la catégorie /428-les-bons-deals s'est
// révélée un leurre — 3 deals épinglés répétés à chaque page).
//
// CLIENT HTTP : Node fetch/undici passe ici en 200 partout (testé au
// reconstat) — le blocage Cloudflare par empreinte TLS qui a fait abandonner
// mrbricolage NE se reproduit PAS. robots.txt PrestaShop autorise
// produits/catégories ; images servies par universparadiscount.ma lui-même
// (un seul hôte, aucun robots tiers).
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_universparadiscount.json — MÊME
// format que scraper-bringo/scraper-inwi, consommé tel quel par
// insert-deals.mjs (résolution enseigne, validation schéma partagé, module
// image, auto_draft, dédup). Aucun deal ne se publie sans validation admin.
//
// RÈGLE ABSOLUE (identique à Bringo/inwi, CONTRAT-V1) : jamais de prix
// deviné. Une carte sans prix barré (.regular-price) ET prix promo (.price)
// clairs et cohérents (normal ≥ promo) est REJETÉE — un produit non remisé
// (pas de .regular-price) est simplement ignoré, jamais complété.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";

const URL_HOME = "https://universparadiscount.ma/";
const CATEGORIE = "Beauté"; // enum canonique (packages/schemas)
const ENSEIGNE = "universparadiscount";
const VILLE = "National"; // catalogue national, pas de ville précise

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
 * Prix PrestaShop au format français — « 298,50 MAD », « 1 008,00 MAD »
 * (espace/&nbsp; en séparateur de milliers, virgule décimale) → 298.5 /
 * 1008. Décimales conservées (665,28 est un vrai prix). null si non
 * parseable ou ≤ 0 — jamais une valeur devinée.
 */
export function parsePrixMAD(texte) {
  if (!texte) return null;
  const nettoye = texte
    .replace(/MAD/gi, "")
    .replace(/\s/g, "") // \s couvre l'espace insécable (&nbsp; = U+00A0) des séparateurs de milliers
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(nettoye)) return null;
  const valeur = Number(nettoye);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

/** URL image directe depuis le data-src (lazy-load ; le src est un
 *  placeholder base64). Retient uniquement l'hôte du site — jamais une URL
 *  arbitraire. */
function extraireImage($card) {
  const dataSrc = $card.find("img[data-src]").first().attr("data-src") || "";
  return dataSrc.startsWith("https://universparadiscount.ma/") ? dataSrc : null;
}

/**
 * Extrait les cartes remisées d'une page (homepage). Sélecteurs (reconstat
 * du 23/07/2026) :
 *  - carte    : .js-product-miniature
 *  - nom/lien : .product_name a (texte + href)
 *  - normal   : .product-price-and-shipping .regular-price   (prix barré)
 *  - promo    : .product-price-and-shipping .price
 *  - image    : img[data-src] (lazy-load)
 * Dédup intra-page par lien produit (une carte peut apparaître dans
 * plusieurs carrousels). Retourne { deals, rejets } — rejet = carte sans
 * les deux prix cohérents (produit non remisé compris).
 */
export function parseHome(html) {
  const $ = cheerio.load(html);
  const deals = [];
  const rejets = [];
  const vus = new Set();

  $(".js-product-miniature").each((_, card) => {
    const $c = $(card);
    const $titre = $c.find(".product_name a").first();
    const nom = $titre.text().trim() || null;
    const lien = $titre.attr("href") || null;

    // Dédup : même produit répété dans plusieurs carrousels de la homepage.
    if (lien && vus.has(lien)) return;

    const prixNormal = parsePrixMAD($c.find(".product-price-and-shipping .regular-price").first().text());
    const prixPromo = parsePrixMAD($c.find(".product-price-and-shipping .price").first().text());
    const photoUrl = extraireImage($c);

    // Rejet prime sur invention (CONTRAT-V1) : sans prix barré (.regular-price)
    // ET prix promo (.price) parseables et cohérents, la carte est ignorée —
    // c'est le cas des produits non remisés (pas de .regular-price), jamais
    // complétés avec une valeur devinée.
    if (!nom) {
      rejets.push({ nom: "(sans nom)", raison: "nom introuvable" });
      return;
    }
    if (prixPromo == null || prixNormal == null) {
      // Non remisé : cas attendu et fréquent (la homepage mélange remisés et
      // non-remisés) — compté en rejet mais sans bruit de log individuel.
      rejets.push({ nom, raison: `non remisé (promo=${prixPromo ?? "?"}, normal=${prixNormal ?? "?"})`, silencieux: true });
      if (lien) vus.add(lien);
      return;
    }
    if (prixNormal < prixPromo) {
      rejets.push({ nom, raison: `prix incohérent (normal ${prixNormal} < promo ${prixPromo})` });
      if (lien) vus.add(lien);
      return;
    }

    if (lien) vus.add(lien);
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

// ---------- Main ----------
async function main() {
  let html;
  try {
    html = await fetchPage(URL_HOME);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const { deals: extraits, rejets } = parseHome(html);
  const rejetsBruyants = rejets.filter((r) => !r.silencieux);
  const nonRemises = rejets.length - rejetsBruyants.length;

  console.log(`💄 Univers Para Discount — homepage`);
  console.log(`   ${extraits.length} offre(s) remisée(s) retenue(s) | ${nonRemises} non remisé(s) ignoré(s) | ${rejetsBruyants.length} rejet(s) signalé(s)`);
  for (const r of rejetsBruyants) console.log(`   ⤫ Rejeté : ${r.nom} — ${r.raison}`);

  const now = new Date().toISOString();
  const deals = extraits.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_universparadiscount",
    extrait_le: now,
  }));

  // Archivage daté : extractions/AAAA-MM-JJ_HH-mm_universparadiscount.json (non committé)
  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_universparadiscount.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) Univers Para Discount retenu(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseHome/parsePrixMAD sans déclencher de requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
