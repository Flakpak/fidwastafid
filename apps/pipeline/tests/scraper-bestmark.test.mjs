import { parseProduits, requetePage } from "../scraper-bestmark.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Vérifie la transformation pure d'une réponse
 * GraphQL Magento. Cœur du test : la règle "jamais de prix deviné"
 * (CONTRAT-V1) — un produit dont le prix final égale le prix normal n'est pas
 * une promotion et doit être écarté, jamais complété.
 *
 * Second point gardé ici : le lien produit ne doit JAMAIS porter de query
 * string — le robots.txt de Bestmark interdit `/*?*`.
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

/** Réponse GraphQL Magento, structure réelle (champs utiles). */
function reponse(items) {
  return { data: { products: { total_count: items.length, items } } };
}

function item({
  nom,
  normal,
  final,
  stock = "IN_STOCK",
  urlKey = "un-produit",
  suffix = ".html",
  image = "https://cdn.bestmark.ma/p.webp",
}) {
  return {
    name: nom,
    sku: "SKU1",
    url_key: urlKey,
    url_suffix: suffix,
    stock_status: stock,
    small_image: image ? { url: image } : null,
    price_range: {
      minimum_price: {
        regular_price: { value: normal },
        final_price: { value: final },
      },
    },
  };
}

console.log("parseProduits — un produit remisé et en stock donne un deal");
{
  const { deals, rejets, nbProduits } = parseProduits(
    reponse([item({ nom: "Tiroir de Caisse", normal: 750, final: 630, urlKey: "tiroir-de-caisse" })])
  );
  check("1 deal extrait", deals.length === 1);
  check("0 rejet", rejets.length === 0);
  check("nbProduits reflète la page", nbProduits === 1);
  check(
    "totalCount remonté (borne de pagination, jamais découverte en cognant)",
    parseProduits(reponse([item({ nom: "X", normal: 2, final: 1 })])).totalCount === 1
  );
  check("prix promo = final_price", deals[0]?.prix_promo === 630);
  check("prix normal = regular_price", deals[0]?.prix_normal === 750);
  check("catégorie High-Tech (enum canonique)", deals[0]?.categorie === "High-Tech");
  check("lien canonique .html", deals[0]?.lien === "https://www.bestmark.ma/tiroir-de-caisse.html");
  check("lien SANS query string (robots.txt Disallow /*?*)", !deals[0]?.lien.includes("?"));
  check("photo reprise de small_image", deals[0]?.photo_url === "https://cdn.bestmark.ma/p.webp");
}

console.log("\nparseProduits — jamais de prix deviné");
{
  const { deals, rejets } = parseProduits(
    reponse([
      item({ nom: "Plein tarif", normal: 9228, final: 9228 }),
      item({ nom: "Prix absent", normal: null, final: null }),
      item({ nom: "Final au-dessus du normal", normal: 100, final: 150 }),
    ])
  );
  check("0 deal extrait", deals.length === 0);
  check("3 produits écartés", rejets.length === 3);
  check("le cas sans remise est nommé comme tel", rejets.some((r) => /aucune remise/.test(r.raison)));
  check("le cas sans prix est nommé comme tel", rejets.some((r) => /prix manquant/.test(r.raison)));
}

console.log("\nparseProduits — un produit épuisé n'est pas une bonne affaire");
{
  const { deals, rejets } = parseProduits(
    reponse([item({ nom: "Remisé mais épuisé", normal: 500, final: 400, stock: "OUT_OF_STOCK" })])
  );
  check("0 deal extrait", deals.length === 0);
  check("rejet explicite hors stock", rejets.length === 1 && /hors stock/.test(rejets[0].raison));
}

console.log("\nparseProduits — garde-fous de forme");
{
  const { deals, rejets } = parseProduits(
    reponse([
      item({ nom: "ok", normal: 200, final: 100 }), // nom < 3 caractères
      item({ nom: "Sans url_key", normal: 200, final: 100, urlKey: "" }),
    ])
  );
  check("nom trop court écarté", rejets.some((r) => /nom absent/.test(r.raison)));
  check("url_key absent écarté (lien non constructible)", rejets.some((r) => /url_key/.test(r.raison)));
  check("0 deal extrait", deals.length === 0);
}

console.log("\nparseProduits — suffixe d'URL absent : repli sur .html, jamais d'URL nue");
{
  const { deals } = parseProduits(reponse([item({ nom: "Produit", normal: 200, final: 100, suffix: null })]));
  check("suffixe .html appliqué", deals[0]?.lien === "https://www.bestmark.ma/un-produit.html");
}

console.log("\nparseProduits — réponse vide ou malformée");
{
  check("data absent → 0 deal", parseProduits({}).deals.length === 0);
  check("null → 0 deal", parseProduits(null).deals.length === 0);
  check("items vide → 0 deal", parseProduits(reponse([])).deals.length === 0);
}

console.log("\nrequetePage — pagination dans le CORPS, jamais dans l'URL");
{
  const q = requetePage(3).query;
  check("currentPage porté par la requête", /currentPage:\s*3/.test(q));
  check("pageSize porté par la requête", /pageSize:\s*100/.test(q));
  check("les prix demandés sont les deux", /regular_price/.test(q) && /final_price/.test(q));
}

console.log("\nparseProduits — mélange réaliste : 1 remisé sur 4 (densité constatée en prod)");
{
  const { deals, rejets } = parseProduits(
    reponse([
      item({ nom: "Pc Portable HP", normal: 9228, final: 9228 }),
      item({ nom: "Tiroir de Caisse", normal: 750, final: 630, urlKey: "tiroir" }),
      item({ nom: "Écran", normal: 1200, final: 1200 }),
      item({ nom: "Clavier", normal: 300, final: 300 }),
    ])
  );
  check("1 deal extrait", deals.length === 1);
  check("3 écartés", rejets.length === 3);
  check("le deal retenu est le seul remisé", deals[0]?.titre === "Tiroir de Caisse");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
