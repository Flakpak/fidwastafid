import { parseProduits, dateFinDepuisISO } from "../scraper-carrefour.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Cœur du test : la sémantique des prix vérifiée
 * empiriquement (crossedPrice = normal, price = promo, CONTRAT-V1 « jamais
 * de prix deviné ») et le repli journalisé sur date_fin=null.
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

/** Produit API carrefour.ma, structure réelle (champs utiles). */
function produit({
  name,
  slug = "un-produit",
  price,
  crossedPrice,
  promotionEndDate = "2026-08-19T00:00:00.000Z",
  category = { name: "Épicerie" },
  mainImageUrl = "https://storage.googleapis.com/img.jpg",
}) {
  return { name, slug, price, crossedPrice, promotionEndDate, category, mainImageUrl };
}

console.log("dateFinDepuisISO — extraction du jour depuis un ISO 8601");
{
  check("date valide", dateFinDepuisISO("2026-08-19T00:00:00.000Z") === "2026-08-19");
  check("null → null", dateFinDepuisISO(null) === null);
  check("undefined → null", dateFinDepuisISO(undefined) === null);
  check("chaîne vide → null", dateFinDepuisISO("") === null);
  check("format invalide → null", dateFinDepuisISO("pas une date") === null);
}

console.log("\nparseProduits — un produit remisé donne un deal");
{
  const { deals, rejets, dateFinManquante } = parseProduits({
    products: [produit({ name: "Shampooing Ultra Doux 400ml", slug: "shampooing-ultra-doux-400ml", price: 34.95, crossedPrice: 45.5 })],
  });
  check("1 deal extrait", deals.length === 1);
  check("0 rejet", rejets.length === 0);
  check("0 date_fin manquante", dateFinManquante === 0);
  check("prix promo = price", deals[0]?.prix_promo === 34.95);
  check("prix normal = crossedPrice", deals[0]?.prix_normal === 45.5);
  check("date_fin extraite", deals[0]?.date_fin === "2026-08-19");
  check("lien construit depuis le slug", deals[0]?.lien === "https://carrefour.ma/produits/shampooing-ultra-doux-400ml");
  check("photo reprise de mainImageUrl", deals[0]?.photo_url === "https://storage.googleapis.com/img.jpg");
  check("catégorie Beauté (mot-clé shampooing)", deals[0]?.categorie === "Beauté");
}

console.log("\nparseProduits — sémantique des prix : crossedPrice DOIT dépasser price");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ name: "Prix incohérent (promo > normal)", price: 50, crossedPrice: 30 }),
      produit({ name: "Prix égaux (pas une remise)", price: 20, crossedPrice: 20 }),
    ],
  });
  check("0 deal extrait (jamais de prix deviné)", deals.length === 0);
  check("2 rejetés pour incohérence", rejets.filter((r) => /incohérent/.test(r.raison)).length === 2);
}

console.log("\nparseProduits — jamais de prix deviné (absents)");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ name: "Sans prix normal", price: 40, crossedPrice: null }),
      produit({ name: "Sans prix promo", price: null, crossedPrice: 80 }),
    ],
  });
  check("0 deal extrait", deals.length === 0);
  check("2 rejets, un par cause", rejets.length === 2);
}

console.log("\nparseProduits — date_fin absente : repli null, JAMAIS silencieux");
{
  const { deals, dateFinManquante } = parseProduits({
    products: [produit({ name: "Sans date de fin", price: 10, crossedPrice: 20, promotionEndDate: null })],
  });
  check("1 deal extrait quand même", deals.length === 1);
  check("date_fin=null en repli", deals[0]?.date_fin === null);
  check("le repli est compté, pas silencieux", dateFinManquante === 1);
}

console.log("\nparseProduits — garde-fous de forme");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ name: "ok", price: 10, crossedPrice: 20 }), // titre < 3 caractères
      produit({ name: "Sans slug", slug: "", price: 10, crossedPrice: 20 }),
    ],
  });
  check("titre trop court écarté", rejets.some((r) => /titre/.test(r.raison)));
  check("slug absent écarté (lien non constructible)", rejets.some((r) => /slug/.test(r.raison)));
  check("0 deal extrait", deals.length === 0);
}

console.log("\nparseProduits — catégorie déduite du rayon si le titre ne suffit pas");
{
  const { deals } = parseProduits({
    products: [
      produit({ name: "Produit sans mot-clé évident", price: 10, crossedPrice: 20, category: { name: "High-Tech & Multimédia" } }),
    ],
  });
  check("repli sur le rayon → High-Tech", deals[0]?.categorie === "High-Tech");
}

console.log("\nparseProduits — charge utile vide ou absente");
{
  check("payload vide → 0 deal", parseProduits({}).deals.length === 0);
  check("payload null → 0 deal", parseProduits(null).deals.length === 0);
  check("products vide → 0 deal", parseProduits({ products: [] }).deals.length === 0);
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
