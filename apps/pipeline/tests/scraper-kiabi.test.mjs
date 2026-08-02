import { parseProduits, choisirVariante, urlPage } from "../scraper-kiabi.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Vérifie la transformation pure de la charge utile
 * Shopify products.json. Cœur du test : la règle "jamais de prix deviné"
 * (CONTRAT-V1) — un produit sans `compare_at_price` strictement supérieur au
 * prix courant n'est PAS une promotion et doit être écarté, jamais complété.
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

/** Produit Shopify, structure réelle de products.json (champs utiles). */
function produit({ titre, handle = "un-handle", variants, image = "https://cdn.shopify.com/img.jpg" }) {
  return {
    title: titre,
    handle,
    images: image ? [{ src: image }] : [],
    variants,
  };
}

const variante = (price, compare, available = true) => ({
  price,
  compare_at_price: compare,
  available,
});

console.log("choisirVariante — sélection de l'offre réellement achetable");
{
  check("aucune variante → null", choisirVariante([]) === null);
  check("variante non remisée → null", choisirVariante([variante("100.00", null)]) === null);
  check(
    "variante remisée mais épuisée → null",
    choisirVariante([variante("85.00", "285.00", false)]) === null
  );
  check(
    "compare_at_price égal au prix → null (pas une remise)",
    choisirVariante([variante("100.00", "100.00")]) === null
  );
  const choisie = choisirVariante([
    variante("120.00", "200.00"),
    variante("85.00", "285.00"),
    variante("99.00", "150.00"),
  ]);
  check("entre plusieurs remisées, la moins chère", choisie?.price === "85.00");
  const mixte = choisirVariante([variante("50.00", "199.00", false), variante("120.00", "200.00", true)]);
  check("ignore la moins chère si elle est épuisée", mixte?.price === "120.00");
}

console.log("\nparseProduits — un produit remisé et disponible donne un deal");
{
  const { deals, rejets } = parseProduits({
    products: [produit({ titre: "Baskets basses à scratchs", handle: "baskets-12", variants: [variante("85.00", "285.00")] })],
  });
  check("1 deal extrait", deals.length === 1);
  check("0 rejet", rejets.length === 0);
  check("prix promo numérique", deals[0]?.prix_promo === 85);
  check("prix normal numérique", deals[0]?.prix_normal === 285);
  check("catégorie Mode (enum canonique)", deals[0]?.categorie === "Mode");
  check("lien produit construit depuis le handle", deals[0]?.lien === "https://kiabi.ma/products/baskets-12");
  check("photo reprise de la première image", deals[0]?.photo_url === "https://cdn.shopify.com/img.jpg");
  check("description non devinée depuis body_html", deals[0]?.description === null);
}

console.log("\nparseProduits — jamais de prix deviné");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ titre: "Plein tarif", variants: [variante("100.00", null)] }),
      produit({ titre: "Remisé mais épuisé", variants: [variante("40.00", "90.00", false)] }),
      produit({ titre: "Sans variante", variants: [] }),
    ],
  });
  check("0 deal extrait", deals.length === 0);
  check("3 produits écartés", rejets.length === 3);
  check(
    "chaque rejet porte une raison lisible",
    rejets.every((r) => typeof r.raison === "string" && r.raison.length > 0)
  );
}

console.log("\nparseProduits — garde-fous de forme");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ titre: "ok", variants: [variante("10.00", "20.00")] }), // titre < 3 caractères
      produit({ titre: "Sans handle", handle: "", variants: [variante("10.00", "20.00")] }),
    ],
  });
  check("titre trop court écarté", rejets.some((r) => /titre/.test(r.raison)));
  check("handle absent écarté (lien non constructible)", rejets.some((r) => /handle/.test(r.raison)));
  check("0 deal extrait", deals.length === 0);
}

console.log("\nparseProduits — charge utile vide ou absente");
{
  check("payload vide → 0 deal", parseProduits({}).deals.length === 0);
  check("payload null → 0 deal", parseProduits(null).deals.length === 0);
  check("products vide → 0 deal", parseProduits({ products: [] }).deals.length === 0);
}

console.log("\nurlPage — pagination Shopify");
{
  check("page 1", urlPage(1) === "https://kiabi.ma/products.json?limit=250&page=1");
  check("page 3", urlPage(3) === "https://kiabi.ma/products.json?limit=250&page=3");
}

console.log("\nparseProduits — mélange réaliste : 2 remisés sur 4 produits");
{
  const { deals, rejets } = parseProduits({
    products: [
      produit({ titre: "Remisé A", handle: "a", variants: [variante("50.00", "100.00")] }),
      produit({ titre: "Plein tarif", handle: "b", variants: [variante("70.00", null)] }),
      produit({ titre: "Remisé B", handle: "c", variants: [variante("30.00", "45.00")] }),
      produit({ titre: "Épuisé", handle: "d", variants: [variante("20.00", "60.00", false)] }),
    ],
  });
  check("2 deals extraits", deals.length === 2);
  check("2 écartés", rejets.length === 2);
  check("les deals retenus sont A et B", deals.map((d) => d.titre).join(",") === "Remisé A,Remisé B");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
