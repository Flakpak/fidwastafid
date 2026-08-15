// ============================================================
// FIDWASTAFID — Scraper Lemobilier.ma (Maison)
// Usage :
//   node scraper-lemobilier.mjs
//
// Cible : la page promo dédiée https://lemobilier.ma/399-promotions
// (PrestaShop, docs/SPIKE-SOURCES.md — RECONTRÔLÉ le 14/08/2026, ORANGE →
// VERT : le `Disallow: /reduction` du robots.txt visait les bons de
// réduction du compte client, jamais cette page). Sur le modèle direct du
// scraper universparadiscount (HTML brut classique, aucun rendu JS requis).
//
// PAGINATION — PARTICULARITÉ MESURÉE, PAS DEVINÉE : `?page=N` est IGNORÉ
// par ce thème (vérifié le 15/08/2026 : trois requêtes `?page=1/2/3`
// renvoient identiquement les 120 premiers articles). Le seul levier réel
// est `n` (items par page), mais il n'accepte QUE les valeurs de son
// sélecteur généré ([24, 48, 120] visibles dans le HTML) PLUS une valeur
// spéciale « voir tout » égale au TOTAL EXACT du moment (`n=291` a répondu
// 291 cartes le 15/08 ; `n=300`, `n=500` sont ignorés et retombent sur 24).
// D'où l'approche en DEUX requêtes : (1) une requête sans paramètre pour
// lire le total réel dans « Articles 1 - X de TOTAL », (2) une seconde avec
// `n=<TOTAL>` pour tout récupérer d'un coup. Aucun plafond posé ici par
// choix (contrairement à decathlon/kiabi) — si le total mesuré ne
// correspond pas au nombre de cartes reçues à l'étape 2 (le site changerait
// de comportement), un avertissement est loggé mais RIEN n'est inventé :
// on insère ce qui a été effectivement reçu, jamais le total annoncé.
//
// CLIENT HTTP : Node fetch/undici passe en 200 (testé le 15/08/2026,
// plusieurs requêtes) — pas de blocage Cloudflare de type decathlon.
//
// PRIX : chaque carte peut porter le prix barré (`.old-price.product-price`)
// EN DOUBLE (deux blocs desktop/mobile identiques dans le même HTML,
// vérifié) — toujours `.first()`, jamais une moyenne ni une somme. Les
// quelques cartes sans prix barré (produits non remisés mélangés à la page
// promo, ~5 sur 291 mesurées) sont ignorées comme n'importe quelle carte
// non remisée, jamais complétées.
//
// Description volontairement à null (comme decathlon/kiabi/carrefour/
// ab-maroc) : la fiche listing expose bien un texte descriptif ici, mais
// l'enrichissement description reste réservé à Bringo (fiche-produit.mjs,
// insert-deals.mjs) — pas de second chemin d'extraction pour cette seule
// source.
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_lemobilier.json — MÊME format que
// les autres scrapers, consommé tel quel par insert-deals.mjs.
//
// RÈGLE ABSOLUE (CONTRAT-V1) : jamais de prix deviné. Une carte sans prix
// barré ET prix promo clairs et cohérents (normal ≥ promo) est REJETÉE.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";

const URL_BASE = "https://lemobilier.ma/399-promotions";
const ID_CATEGORIE = 399;
const CATEGORIE = "Maison"; // enum canonique (packages/schemas)
const ENSEIGNE = "lemobilier";
const VILLE = "National"; // catalogue national, pas de ville précise

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/** Total annoncé par PrestaShop (« Articles 1 - 24 de 291 ») — null si le
 *  marqueur a disparu (changement de thème), jamais une valeur devinée. */
export function extraireTotal(html) {
  const m = html.match(/Articles\s+\d+\s*-\s*\d+\s+de\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Prix PrestaShop « 1 314,00 DHS » (espace en séparateur de milliers,
 * virgule décimale, suffixe DHS) → 1314. null si non parseable ou ≤ 0.
 */
export function parsePrixDHS(texte) {
  if (!texte) return null;
  const nettoye = texte
    .replace(/DHS/gi, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(nettoye)) return null;
  const valeur = Number(nettoye);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

function extraireImage($card) {
  const src = $card.find(".product-image-container img").first().attr("src") || "";
  return src.startsWith("https://lemobilier.ma/") ? src : null;
}

/**
 * Extrait les cartes de la page promo. Sélecteurs (mesurés le 15/08/2026) :
 *  - carte    : .ajax_block_product
 *  - nom/lien : .product-name (texte + href)
 *  - normal   : .old-price.product-price (prix barré, souvent dupliqué en HTML — .first())
 *  - promo    : [itemprop="price"].price.product-price
 *  - image    : .product-image-container img (src direct, pas de lazy-load)
 * Retourne { deals, rejets }.
 */
export function parsePromotions(html) {
  const $ = cheerio.load(html);
  const deals = [];
  const rejets = [];

  $(".ajax_block_product").each((_, card) => {
    const $c = $(card);
    const $titre = $c.find(".product-name").first();
    const nom = $titre.text().trim() || null;
    const lien = $titre.attr("href") || null;

    const prixNormal = parsePrixDHS($c.find(".old-price.product-price").first().text());
    const prixPromo = parsePrixDHS($c.find('[itemprop="price"].price.product-price').first().text());
    const photoUrl = extraireImage($c);

    if (!nom) {
      rejets.push({ nom: "(sans nom)", raison: "nom introuvable" });
      return;
    }
    if (prixPromo == null || prixNormal == null) {
      // Non remisé : cas attendu (la page promo mélange quelques produits
      // sans prix barré) — compté en rejet silencieux, jamais complété.
      rejets.push({ nom, raison: `non remisé (promo=${prixPromo ?? "?"}, normal=${prixNormal ?? "?"})`, silencieux: true });
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
      description: null, // réservé à Bringo, voir en-tête
      photo_url: photoUrl,
      lien,
      date_fin: null, // aucune date de fin exposée sur cette page
    });
  });

  return { deals, rejets };
}

// ---------- Main ----------
async function main() {
  let htmlDefaut, total;
  try {
    htmlDefaut = await fetchPage(URL_BASE);
    total = extraireTotal(htmlDefaut);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  if (!total) {
    console.error("❌ Total introuvable dans la page (marqueur « Articles X - Y de Z » absent) — thème changé ?");
    process.exit(1);
  }
  console.log(`📄 Total annoncé par le site : ${total} article(s) en page promo`);

  let html;
  try {
    html = await fetchPage(`${URL_BASE}?id_category=${ID_CATEGORIE}&n=${total}`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const { deals: extraits, rejets } = parsePromotions(html);
  if (extraits.length + rejets.length !== total) {
    console.warn(
      `⚠️ ${extraits.length + rejets.length} carte(s) reçue(s) pour un total annoncé de ${total} — le site n'a peut-être pas honoré n=${total}. Rien d'inventé : on garde ce qui a été effectivement reçu.`
    );
  }

  const rejetsBruyants = rejets.filter((r) => !r.silencieux);
  const nonRemises = rejets.length - rejetsBruyants.length;

  console.log(`🛋️ Lemobilier.ma — page promo`);
  console.log(`   ${extraits.length} offre(s) remisée(s) retenue(s) | ${nonRemises} non remisé(s) ignoré(s) | ${rejetsBruyants.length} rejet(s) signalé(s)`);
  for (const r of rejetsBruyants) console.log(`   ⤫ Rejeté : ${r.nom} — ${r.raison}`);

  const now = new Date().toISOString();
  const deals = extraits.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_lemobilier",
    extrait_le: now,
  }));

  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_lemobilier.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) Lemobilier.ma retenu(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
