import { parseProduits } from "../scraper-ab-maroc.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality").
 * Cœur du test : conversion des prix en sous-unité (Store API WooCommerce),
 * catégorie mono-domaine posée en dur (mesuré, pas mapCategorie), et le
 * repli journalisé sur date_fin=null.
 */

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

/** Produit Store API WooCommerce, structure réelle (champs utiles). */
function produit({
  name,
  slug = "un-produit",
  salePrice,
  regularPrice,
  minorUnit = 2,
  dateOnSaleTo = "2026-08-20T23:59:59",
  permalink = "https://ab-maroc.com/produit/un-produit/",
  images = [{ id: 1, src: "https://ab-maroc.com/img.jpg" }],
}) {
  return {
    name,
    slug,
    permalink,
    images,
    prices: {
      sale_price: salePrice,
      regular_price: regularPrice,
      currency_minor_unit: minorUnit,
    },
    date_on_sale_to: dateOnSaleTo,
  };
}

console.log("parseProduits — un produit remisé donne un deal, catégorie posée en dur");
{
  const { deals, rejets, dateFinManquante } = parseProduits([
    produit({ name: "Souffleur aspirateur 800W", salePrice: "54900", regularPrice: "60000" }),
  ]);
  check("1 deal extrait", deals.length === 1);
  check("0 rejet", rejets.length === 0);
  check("0 date_fin manquante", dateFinManquante === 0);
  check("prix promo converti depuis les centimes", deals[0]?.prix_promo === 549);
  check("prix normal converti depuis les centimes", deals[0]?.prix_normal === 600);
  check("catégorie fixe Bricolage & Jardin (mono-domaine)", deals[0]?.categorie === "Bricolage & Jardin");
  check("lien = permalink", deals[0]?.lien === "https://ab-maroc.com/produit/un-produit/");
  check("photo = première image", deals[0]?.photo_url === "https://ab-maroc.com/img.jpg");
}

console.log("\nparseProduits — sémantique des prix : regular_price DOIT dépasser sale_price");
{
  const { deals, rejets } = parseProduits([
    produit({ name: "Prix incohérent", salePrice: "5000", regularPrice: "3000" }),
    produit({ name: "Prix égaux (pas une remise)", salePrice: "2000", regularPrice: "2000" }),
  ]);
  check("0 deal extrait (jamais de prix deviné)", deals.length === 0);
  check("2 rejetés pour incohérence", rejets.filter((r) => /incohérent/.test(r.raison)).length === 2);
}

console.log("\nparseProduits — jamais de prix deviné (absents ou non numériques)");
{
  const { deals, rejets } = parseProduits([
    produit({ name: "Sans prix normal", salePrice: "4000", regularPrice: null }),
    produit({ name: "Sans prix promo", salePrice: undefined, regularPrice: "8000" }),
  ]);
  check("0 deal extrait", deals.length === 0);
  check("2 rejets, un par cause", rejets.length === 2);
}

console.log("\nparseProduits — date_fin absente : repli null, JAMAIS silencieux");
{
  const { deals, dateFinManquante } = parseProduits([
    produit({ name: "Sans date de fin", salePrice: "1000", regularPrice: "2000", dateOnSaleTo: null }),
  ]);
  check("1 deal extrait quand même", deals.length === 1);
  check("date_fin=null en repli", deals[0]?.date_fin === null);
  check("le repli est compté, pas silencieux", dateFinManquante === 1);
}

console.log("\nparseProduits — date_fin présente, extraite");
{
  const { deals } = parseProduits([
    produit({ name: "Avec date de fin", salePrice: "1000", regularPrice: "2000", dateOnSaleTo: "2026-08-20T23:59:59" }),
  ]);
  check("date_fin extraite (jour calendaire)", deals[0]?.date_fin === "2026-08-20");
}

console.log("\nparseProduits — garde-fous de forme");
{
  const { deals, rejets } = parseProduits([
    produit({ name: "ok", salePrice: "1000", regularPrice: "2000" }), // titre < 3 caractères
    produit({ name: "Sans permalink", salePrice: "1000", regularPrice: "2000", permalink: "" }),
  ]);
  check("titre trop court écarté", rejets.some((r) => /titre/.test(r.raison)));
  check("permalink absent écarté (lien non constructible)", rejets.some((r) => /permalink/.test(r.raison)));
  check("0 deal extrait", deals.length === 0);
}

console.log("\nparseProduits — charge utile vide ou absente");
{
  check("liste vide → 0 deal", parseProduits([]).deals.length === 0);
  check("undefined → 0 deal", parseProduits(undefined).deals.length === 0);
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
