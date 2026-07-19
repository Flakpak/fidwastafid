// ============================================================
// FIDWASTAFID — Scraper Bringo (Carrefour Maroc)
// Usage :
//   npm install cheerio
//   node scraper-bringo.mjs <url-listing-OU-fichier.txt> <ville> [--tous]
//   Ex : node scraper-bringo.mjs "https://www.bringo.ma/fr_MA/store/…/high-tech-multimedia?limit=100" Casablanca
//   Ex : node scraper-bringo.mjs bringo-categories.txt Casablanca
//
// Mode fichier : un .txt avec une URL de catégorie par ligne
// (lignes vides et lignes commençant par # ignorées).
//
// Par défaut : ne garde QUE les produits remisés (discount > 0).
// Option --tous : garde tout (utile pour tester une page).
// Sortie : deals-extraits.json (même format que extract-catalogue,
// compatible insert-deals.mjs) — avec photo_url et lien officiels.
// Gère la pagination Sylius (?page=2, 3…) automatiquement.
// ============================================================

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import * as cheerio from "cheerio";

const [, , URL_LISTING, VILLE, FLAG] = process.argv;
if (!URL_LISTING || !VILLE) {
  console.error('Usage : node scraper-bringo.mjs <url-listing> <ville> [--tous]');
  process.exit(1);
}
const GARDER_TOUT = FLAG === "--tous";
const BASE = "https://www.bringo.ma";
const MAX_PAGES = 10; // garde-fou anti-boucle infinie

// Mapping simple item_list_name → catégorie Fidwastafid
function mapCategorie(listName = "") {
  const l = listName.toLowerCase();
  if (/fruit|légume|viande|poisson|épicerie|boisson|lait|fromage|surgelé|biscuit/.test(l)) return "Alimentaire";
  if (/tv|téléphone|ordinateur|souris|clavier|powerbank|casque|écouteur|câble|informatique|enceinte|audio|bluetooth|tablette|montre|console|chargeur/.test(l)) return "High-Tech";
  if (/réfrigérateur|lave|four|aspirateur|micro-onde|climatiseur|électroménager/.test(l)) return "Électroménager";
  if (/meuble|déco|cuisine|linge|jardin|bricolage/.test(l)) return "Maison";
  if (/vêtement|chaussure|mode/.test(l)) return "Mode";
  if (/beauté|hygiène|parfum|shampoing/.test(l)) return "Beauté";
  if (/bébé|enfant|jouet/.test(l)) return "Enfants";
  return "Autre";
}

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

function parseProducts(html) {
  const $ = cheerio.load(html);
  const produits = [];

  $(".box-product").each((_, el) => {
    const box = $(el);
    const titre = box.attr("data-cnstrc-item-name")?.trim();
    const lienRel = box.find('a[href*="/products/"]').first().attr("href");
    const photo = box.find("img.image-product").first().attr("src") || null;

    // Le JSON de tracking embarqué dans onclick (HTML-encodé)
    const onclick = box.find("a[onclick]").first().attr("onclick") || "";
    const match = onclick.match(/\{.*\}/s);
    let data = {};
    if (match) {
      try {
        data = JSON.parse(match[0].replaceAll("&quot;", '"'));
      } catch { /* JSON illisible : on garde les data-attributs */ }
    }

    const prixPromoCts = data.price ?? null;          // prix actuel en centimes
    const prixNormalCts = data.initial_price ?? null; // prix d'origine en centimes
    const discount = data.discount ?? 0;

    if (!titre || prixPromoCts == null) return;

    produits.push({
      _key: lienRel || `${titre}|${prixPromoCts}`, // identifiant unique (retiré avant sortie)
      titre,
      prix_promo: prixPromoCts / 100,
      prix_normal: prixNormalCts != null ? prixNormalCts / 100 : null,
      discount,
      discount_rate: data.discount_rate || "0%",
      categorie: mapCategorie(data.item_list_name),
      // La vraie description est extraite depuis la fiche produit à
      // l'insertion (insert-deals.mjs → fiche-produit.mjs) — plus de
      // synthèse "marque — remise X%" ici, purement dérivée du prix et
      // sans valeur informative propre.
      description: null,
      photo_url: photo,
      lien: lienRel ? BASE + lienRel : null,
      date_fin: null, // Bringo n'affiche pas de date de fin sur les listings
    });
  });

  return produits;
}

// ---------- Main : une ou plusieurs catégories, pagination auto ----------

let listings = [URL_LISTING];
if (URL_LISTING.endsWith(".txt")) {
  listings = readFileSync(URL_LISTING, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  console.log(`📋 ${listings.length} catégories à parcourir\n`);
}

let tous = [];
const dejaVus = new Set();
for (const listing of listings) {
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const sep = listing.includes("?") ? "&" : "?";
    const url = pageNum === 1 ? listing : `${listing}${sep}page=${pageNum}`;
    console.log(`📄 Page ${pageNum} : ${url.slice(0, 90)}…`);

    let produits;
    try {
      produits = parseProducts(await fetchPage(url));
    } catch (err) {
      console.error(`❌ ${err.message}`);
      break;
    }

    // Bringo resert la page 1 au-delà de la dernière page :
    // on ne garde que les produits jamais vus, et on s'arrête s'il n'y en a aucun.
    const nouveaux = produits.filter((p) => !dejaVus.has(p._key));
    if (nouveaux.length === 0) {
      console.log("   (aucun produit nouveau — fin de la pagination)");
      break;
    }
    nouveaux.forEach((p) => dejaVus.add(p._key));
    console.log(`   ${nouveaux.length} produits nouveaux`);
    tous = tous.concat(nouveaux);
    await new Promise((r) => setTimeout(r, 2000)); // politesse : 2 s entre pages
  }
}

// Filtre deals : uniquement les produits remisés
const remises = tous.filter((p) => p.discount > 0 || (p.prix_normal && p.prix_normal > p.prix_promo));
const retenus = GARDER_TOUT ? tous : remises;

// Format final compatible insert-deals.mjs
const now = new Date().toISOString();
const deals = retenus.map(({ _key, discount, discount_rate, ...d }) => ({
  ...d,
  // prix_normal obligatoire en base : si absent et pas de remise détectable,
  // le deal sera rejeté à l'insertion (comportement voulu)
  enseigne: "Carrefour",
  ville: VILLE,
  statut: "auto_draft",
  source_type: "scraper_bringo",
  extrait_le: now,
}));

// Archivage daté : extractions/AAAA-MM-JJ_HH-mm_bringo-<ville>.json
mkdirSync("extractions", { recursive: true });
const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
const fichierSortie = `extractions/${horodatage}_bringo-${VILLE.toLowerCase().replace(/\s+/g, "-")}.json`;
writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

console.log(`\n✅ ${tous.length} produits parcourus | ${remises.length} en promo | ${deals.length} retenus`);
console.log(`→ Archive : ${fichierSortie}`);
console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
