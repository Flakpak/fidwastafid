import { parsePromotions, parsePrixDHS, extraireTotal } from "../scraper-lemobilier.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Fragments HTML fidèles aux cartes
 * .ajax_block_product réelles de lemobilier.ma/399-promotions (mesurées le
 * 15/08/2026). Cœur du test : le prix barré dupliqué dans le DOM réel
 * (.first() jamais une moyenne), et la règle "jamais de prix deviné"
 * (CONTRAT-V1).
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

/** Carte remisée, structure réelle (prix barré dupliqué desktop/mobile). */
function carteRemisee({ nom, slug, promo, normal, dupliquerAncien = true }) {
  const ancien = `<span class="old-price product-price"> ${normal} DHS </span>`;
  return `
  <li class="ajax_block_product col-xs-12 col-sm-6 col-md-4">
    <div class="product-container">
      <div class="product-image-container">
        <a class="product_img_link" href="https://lemobilier.ma/cat/${slug}.html">
          <img class="replace-2x img-responsive" src="https://lemobilier.ma/img/${slug}.jpg" alt="${nom}" />
        </a>
        <div class="content_price">
          <span itemprop="price" class="price product-price"> ${promo} DHS </span>
          ${ancien}
          ${dupliquerAncien ? ancien : ""}
          <span class="price-percent-reduction">-40%</span>
        </div>
      </div>
      <h5><a class="product-name" href="https://lemobilier.ma/cat/${slug}.html" title="${nom}">${nom}</a></h5>
    </div>
  </li>`;
}

/** Carte NON remisée (pas de prix barré). */
function carteNonRemisee({ nom, slug, prix }) {
  return `
  <li class="ajax_block_product col-xs-12 col-sm-6 col-md-4">
    <div class="product-container">
      <div class="product-image-container">
        <a class="product_img_link" href="https://lemobilier.ma/cat/${slug}.html">
          <img class="replace-2x img-responsive" src="https://lemobilier.ma/img/${slug}.jpg" alt="${nom}" />
        </a>
        <div class="content_price">
          <span itemprop="price" class="price product-price"> ${prix} DHS </span>
        </div>
      </div>
      <h5><a class="product-name" href="https://lemobilier.ma/cat/${slug}.html" title="${nom}">${nom}</a></h5>
    </div>
  </li>`;
}

console.log("parsePrixDHS — format français Lemobilier.ma (exemples réels du lot)");
check('"1 314,00 DHS" (espace de milliers) -> 1314', parsePrixDHS("1 314,00 DHS") === 1314);
check('" 2 190,00 DHS " (espaces autour) -> 2190', parsePrixDHS(" 2 190,00 DHS ") === 2190);
check('"665,28 DHS" -> 665.28 (décimales conservées)', parsePrixDHS("665,28 DHS") === 665.28);
check("texte vide -> null (jamais deviné)", parsePrixDHS("") === null);
check('"Gratuit" -> null (jamais deviné)', parsePrixDHS("Gratuit") === null);

console.log("\nextraireTotal — marqueur « Articles X - Y de TOTAL »");
check(
  '"Articles 1 - 24 de 291" -> 291',
  extraireTotal('<div class="product-count"> Articles 1 - 24 de 291</div>') === 291
);
check("marqueur absent -> null (jamais deviné)", extraireTotal("<div>rien ici</div>") === null);

console.log("\nparsePromotions — carte remisée avec prix barré DUPLIQUÉ (cas réel mesuré)");
{
  const html = `<body>${carteRemisee({ nom: "Tabouret MADIA", slug: "4898-tabouret-madia", promo: "1 314,00", normal: "2 190,00" })}</body>`;
  const { deals, rejets } = parsePromotions(html);
  check("1 deal extrait, 0 rejeté", deals.length === 1 && rejets.length === 0);
  check("titre extrait", deals[0]?.titre === "Tabouret MADIA");
  check(
    "prix_normal = 2190 (le PREMIER des deux blocs dupliqués, jamais une moyenne/somme)",
    deals[0]?.prix_normal === 2190
  );
  check("prix_promo = 1314", deals[0]?.prix_promo === 1314);
  check("categorie fixée Maison", deals[0]?.categorie === "Maison");
  check("description = null (réservé à Bringo)", deals[0]?.description === null);
  check("date_fin = null (non exposée sur cette page)", deals[0]?.date_fin === null);
  check(
    "image = URL lemobilier.ma directe",
    deals[0]?.photo_url === "https://lemobilier.ma/img/4898-tabouret-madia.jpg"
  );
  check("lien = URL produit réelle", deals[0]?.lien === "https://lemobilier.ma/cat/4898-tabouret-madia.html");
}

console.log("\nparsePromotions — carte remisée avec un SEUL bloc de prix barré (pas systématiquement dupliqué)");
{
  const html = `<body>${carteRemisee({ nom: "Chaise unique", slug: "chaise-unique", promo: "199,00", normal: "299,00", dupliquerAncien: false })}</body>`;
  const { deals } = parsePromotions(html);
  check("prix_normal = 299 même sans duplication", deals[0]?.prix_normal === 299);
}

console.log("\nparsePromotions — RÈGLE ABSOLUE : carte sans prix barré -> REJETÉE (jamais de prix deviné)");
{
  const html = `<body>${carteNonRemisee({ nom: "Coussin sans promo", slug: "coussin", prix: "149,00" })}</body>`;
  const { deals, rejets } = parsePromotions(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet silencieux (non remisé)", rejets.length === 1 && rejets[0]?.silencieux === true);
}

console.log("\nparsePromotions — prix incohérent (normal < promo) -> REJETÉ, bruyant");
{
  const html = `<body>${carteRemisee({ nom: "Anomalie prix", slug: "anomalie", promo: "300,00", normal: "200,00" })}</body>`;
  const { deals, rejets } = parsePromotions(html);
  check("0 deal extrait", deals.length === 0);
  check(
    "1 rejet bruyant pour incohérence",
    rejets.length === 1 && !rejets[0]?.silencieux && /incohérent/.test(rejets[0]?.raison ?? "")
  );
}

console.log("\nparsePromotions — mélange : 2 valides + 1 sans prix barré sur la même page");
{
  const html = `<body>
    ${carteRemisee({ nom: "Deal A", slug: "deal-a", promo: "119,00", normal: "149,00" })}
    ${carteNonRemisee({ nom: "Sans réduction", slug: "sans-reduc", prix: "49,00" })}
    ${carteRemisee({ nom: "Deal B", slug: "deal-b", promo: "399,00", normal: "696,00" })}
  </body>`;
  const { deals, rejets } = parsePromotions(html);
  check("2 deals extraits (les 2 avec prix barré)", deals.length === 2);
  check("1 rejeté (celui sans prix barré)", rejets.length === 1);
  check("les deals retenus sont A et B", deals.map((d) => d.titre).join(",") === "Deal A,Deal B");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
