import { parseHome, parsePrixMAD } from "../scraper-universparadiscount.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Vérifie le parsing DOM pur (parseHome) sur des
 * fragments HTML fidèles aux cartes PrestaShop .js-product-miniature réelles
 * de la homepage universparadiscount.ma, et le parseur de prix français
 * (parsePrixMAD). Cœur du test : la règle "jamais de prix deviné"
 * (CONTRAT-V1) — une carte sans prix barré (produit non remisé) est REJETÉE.
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

/** Carte remisée (regular-price + price), structure réelle PrestaShop. */
function carteRemisee({ nom, slug, normal, promo }) {
  return `
  <div class="js-product-miniature" data-id-product="4215">
    <div class="element-top">
      <a href="https://universparadiscount.ma/gels-solaire/${slug}.html" title="${nom}">
        <img class="ax-lazy-load" src="data:image/jpeg;base64,AAAA"
             data-src="https://universparadiscount.ma/28096-square_home_default/${slug}.jpg" alt="${nom}"/>
      </a>
    </div>
    <div class="product-description">
      <div class="product_name"><a href="https://universparadiscount.ma/gels-solaire/${slug}.html" title="${nom}">${nom}</a></div>
      <div class="info-product"><div class="product-price-and-shipping">
        <span class="regular-price">${normal}&nbsp;MAD</span>
        <span class="price"> ${promo}&nbsp;MAD </span>
      </div></div>
    </div>
  </div>`;
}

/** Carte NON remisée (prix courant seul, pas de .regular-price). */
function carteNonRemisee({ nom, slug, prix }) {
  return `
  <div class="js-product-miniature" data-id-product="3000">
    <div class="product-description">
      <div class="product_name"><a href="https://universparadiscount.ma/soins/${slug}.html" title="${nom}">${nom}</a></div>
      <div class="info-product"><div class="product-price-and-shipping">
        <span class="price"> ${prix}&nbsp;MAD </span>
      </div></div>
    </div>
  </div>`;
}

console.log("parsePrixMAD — format français PrestaShop (exemples réels du lot)");
check('"298,50 MAD" -> 298.5', parsePrixMAD("298,50 MAD") === 298.5);
check('"1 008,00 MAD" (espace de milliers) -> 1008', parsePrixMAD("1 008,00 MAD") === 1008);
check('"665,28 MAD" -> 665.28 (décimales conservées)', parsePrixMAD("665,28 MAD") === 665.28);
check("texte vide -> null (jamais deviné)", parsePrixMAD("") === null);
check('"Gratuit" -> null (jamais deviné)', parsePrixMAD("Gratuit") === null);
check('"0,00 MAD" -> null (prix nul jamais accepté)', parsePrixMAD("0,00 MAD") === null);

console.log("\nparseHome — carte remisée (exemple réel du lot)");
{
  const html = `<body>${carteRemisee({ nom: "KLORANE SHAMPOOING ANTIPELLICULAIRE", slug: "klorane-antipel", normal: "128,00", promo: "85,38" })}</body>`;
  const { deals, rejets } = parseHome(html);
  check("1 deal extrait", deals.length === 1);
  check("0 rejet signalé (aucun non-remisé, aucune incohérence)", rejets.length === 0);
  check("titre extrait", deals[0]?.titre === "KLORANE SHAMPOOING ANTIPELLICULAIRE");
  check("prix_promo = 85.38 (.price)", deals[0]?.prix_promo === 85.38);
  check("prix_normal = 128 (.regular-price, barré)", deals[0]?.prix_normal === 128);
  check("categorie fixée Beauté", deals[0]?.categorie === "Beauté");
  check(
    "image = data-src (lazy-load), jamais le placeholder base64",
    deals[0]?.photo_url === "https://universparadiscount.ma/28096-square_home_default/klorane-antipel.jpg"
  );
  check("lien = URL produit réelle", deals[0]?.lien === "https://universparadiscount.ma/gels-solaire/klorane-antipel.html");
}

console.log("\nparseHome — RÈGLE ABSOLUE : produit non remisé (pas de .regular-price) -> IGNORÉ (jamais de prix deviné)");
{
  const html = `<body>${carteNonRemisee({ nom: "Crème sans promo", slug: "creme-x", prix: "120,00" })}</body>`;
  const { deals, rejets } = parseHome(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet (non remisé)", rejets.length === 1);
  check("rejet marqué silencieux (cas attendu, pas un incident)", rejets[0]?.silencieux === true);
  check("raison mentionne non remisé", /non remisé/.test(rejets[0]?.raison ?? ""));
}

console.log("\nparseHome — prix incohérent (normal < promo) -> REJETÉ (signalé)");
{
  const html = `<body>${carteRemisee({ nom: "Anomalie prix", slug: "anomalie", normal: "200,00", promo: "300,00" })}</body>`;
  const { deals, rejets } = parseHome(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet pour incohérence, non silencieux", rejets.length === 1 && /incohérent/.test(rejets[0]?.raison ?? "") && !rejets[0]?.silencieux);
}

console.log("\nparseHome — mélange + dédup (même produit dans 2 carrousels)");
{
  const remisee = carteRemisee({ nom: "Deal A", slug: "deal-a", normal: "149,00", promo: "119,00" });
  const html = `<body>
    ${remisee}
    ${carteNonRemisee({ nom: "Non remisé", slug: "non-remise", prix: "49,00" })}
    ${carteRemisee({ nom: "Deal B", slug: "deal-b", normal: "696,00", promo: "399,00" })}
    ${remisee}
  </body>`;
  const { deals } = parseHome(html);
  check("2 deals uniques extraits (Deal A dédupliqué, Deal B), non-remisé ignoré", deals.length === 2);
  check("les deals retenus sont A et B", deals.map((d) => d.titre).join(",") === "Deal A,Deal B");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
