import { parseProduits } from "../scraper-aswakassalam.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality").
 * Cœur du test : catégorisation PAR RAYON (pas mono-domaine, contrairement à
 * ab-maroc.mjs) — un titre alimentaire réel qui ne porte aucun mot-clé de
 * mapCategorie() doit quand même atterrir sur "Alimentaire" grâce au rayon
 * WooCommerce, jamais sur "Autre" par défaut.
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

function produit({
  name,
  slug = "un-produit",
  salePrice,
  regularPrice,
  minorUnit = 2,
  dateOnSaleTo = null,
  permalink = "https://aswakassalam.com/produit/un-produit/",
  categories = [],
  images = [{ id: 1, src: "https://aswakassalam.com/img.jpg" }],
}) {
  return {
    name,
    slug,
    permalink,
    images,
    categories,
    prices: {
      sale_price: salePrice,
      regular_price: regularPrice,
      currency_minor_unit: minorUnit,
    },
    date_on_sale_to: dateOnSaleTo,
  };
}

console.log("parseProduits — catégorie déduite du rayon quand le titre ne suffit pas (cas réel du 14/08/2026)");
{
  const { deals } = parseProduits([
    produit({
      name: "BOUCHEES AGNEAU POUR CHIEN ADULTE 400G ALPHAPET",
      salePrice: "895",
      regularPrice: "1195",
      categories: [{ name: "ANIMALERIE" }],
    }),
    produit({
      name: "Pack de 16 pots Raïbi Jamila 165g",
      salePrice: "3295",
      regularPrice: "3995",
      categories: [{ name: "CRÈMERIE" }, { name: "YAOURT, DESSERT & COMPOTE" }],
    }),
    produit({
      name: "Crème solaire SPF 50+ 200ml",
      salePrice: "16495",
      regularPrice: "21595",
      categories: [{ name: "BEAUTÉ" }, { name: "BEAUTÉ & HYGIÈNE" }],
    }),
    produit({
      name: "Gourde isotherme en aluminium 500ml",
      salePrice: "4995",
      regularPrice: "7995",
      categories: [{ name: "ACCESSOIRES DÉCORATION & RANGEMENT" }, { name: "MAISON & CUISINE" }],
    }),
  ]);
  check("4 deals extraits", deals.length === 4);
  check(
    "rayon sans équivalent dans l'enum (ANIMALERIE) → Autre, jamais inventé",
    deals[0]?.categorie === "Autre"
  );
  check("rayon CRÈMERIE → Alimentaire", deals[1]?.categorie === "Alimentaire");
  check("rayon BEAUTÉ → Beauté", deals[2]?.categorie === "Beauté");
  check("rayon MAISON & CUISINE → Maison", deals[3]?.categorie === "Maison");
}

console.log("\nparseProduits — sémantique des prix : regular_price DOIT dépasser sale_price");
{
  const { deals, rejets } = parseProduits([
    produit({ name: "Prix incohérent", salePrice: "5000", regularPrice: "3000" }),
  ]);
  check("0 deal extrait (jamais de prix deviné)", deals.length === 0);
  check("rejeté pour incohérence", rejets.some((r) => /incohérent/.test(r.raison)));
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

console.log("\nparseProduits — garde-fous de forme");
{
  const { deals, rejets } = parseProduits([
    produit({ name: "ok", salePrice: "1000", regularPrice: "2000" }),
    produit({ name: "Sans permalink", salePrice: "1000", regularPrice: "2000", permalink: "" }),
  ]);
  check("titre trop court écarté", rejets.some((r) => /titre/.test(r.raison)));
  check("permalink absent écarté", rejets.some((r) => /permalink/.test(r.raison)));
  check("0 deal extrait", deals.length === 0);
}

console.log("\nparseProduits — charge utile vide ou absente");
{
  check("liste vide → 0 deal", parseProduits([]).deals.length === 0);
  check("undefined → 0 deal", parseProduits(undefined).deals.length === 0);
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
