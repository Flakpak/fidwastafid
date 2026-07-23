import { parseListing, parsePrixDeca, pageEstDecathlon } from "../scraper-decathlon.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Vérifie le parsing DOM pur (parseListing) sur des
 * fragments HTML fidèles aux cartes article.product-card réelles de
 * decathlon.ma/5080-promotions, le parseur de prix français (parsePrixDeca,
 * préfixe lecteur d'écran compris) et la garde anti-pollution inter-tenant
 * (pageEstDecathlon, surcoût #1 du spike). Cœur du test : la règle "jamais
 * de prix deviné" (CONTRAT-V1).
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

/** Carte remisée complète, structure réelle Decathlon "oneshop". */
function carteRemisee({ nom, slug, promo, normal, remise }) {
  return `
  <article class="product-card" data-sku="fd4a562d-0000-0000-0000-000000000000">
    <a href="https://www.decathlon.ma/p/306807-79688-${slug}.html" class="js-product-card-link">
      <img src="https://contents.mediadecathlon.com/p2606754/1cr1/k$abc/prod.jpg?format=auto&f=1024x0" alt="${nom}"/>
    </a>
    <div class="product-card_header">
      <p data-testid="product-card-brand">NABAIJI</p>
      <h2>${nom}</h2>
    </div>
    <div class="price">
      <span class="price_amount" data-testid="current-price" data-value="${Math.floor(promo)}" aria-label="Current price"> ${String(promo).replace(".", ",")}0&nbsp;MAD </span>
      <span class="price_barred-amount" data-testid="price-before-reduction"> <span class="u-sr-only">Prix avant la réduction </span> ${String(normal).replace(".", ",")}0&nbsp;MAD </span>
      <span class="price_discount" data-testid="discount-amount"> ${remise}% </span>
    </div>
  </article>`;
}

/** Carte NON remisée (prix courant seul, pas de prix barré). */
function carteNonRemisee({ nom, slug, prix }) {
  return `
  <article class="product-card">
    <a href="https://www.decathlon.ma/p/111111-22222-${slug}.html">
      <img src="https://contents.mediadecathlon.com/p1/k$x/prod.jpg" alt="${nom}"/>
    </a>
    <h2>${nom}</h2>
    <div class="price">
      <span class="price_amount" data-testid="current-price" data-value="${prix}"> ${prix},00&nbsp;MAD </span>
    </div>
  </article>`;
}

console.log("parsePrixDeca — format français Decathlon (exemples réels du lot)");
check('"259,00 MAD" -> 259', parsePrixDeca("259,00 MAD") === 259);
check('"1 299,00 MAD" (espace de milliers) -> 1299', parsePrixDeca("1 299,00 MAD") === 1299);
check(
  '"Prix avant la réduction 299,00 MAD" (préfixe lecteur d\'écran) -> 299',
  parsePrixDeca("Prix avant la réduction \n          299,00 MAD") === 299
);
check('"259,90 MAD" -> 259.9 (décimales conservées, pas le data-value tronqué)', parsePrixDeca("259,90 MAD") === 259.9);
check("texte vide -> null (jamais deviné)", parsePrixDeca("") === null);
check('"Gratuit" -> null (jamais deviné)', parsePrixDeca("Gratuit") === null);

console.log("\npageEstDecathlon — garde anti-pollution inter-tenant (surcoût #1 du spike)");
check(
  "page Decathlon légitime -> acceptée",
  pageEstDecathlon("<title>promotion Maroc - Decathlon</title><article class='product-card'></article>")
);
check(
  "titre étranger (parapharmacie) -> refusée",
  !pageEstDecathlon("<title>Para pharmacie N 1 des Solutions Bien-Être</title><body>...</body>")
);
check(
  "titre Decathlon MAIS corps pollué (universparadiscount) -> refusée",
  !pageEstDecathlon("<title>Sac - Decathlon</title><a href='https://universparadiscount.ma/'>lien</a>")
);
check(
  "titre Decathlon MAIS cookie PrestaShop tiers dans le corps -> refusée",
  !pageEstDecathlon("<title>x - Decathlon</title>PrestaShop-9f2cb8=abc")
);

console.log("\nparseListing — carte remisée (exemple réel du lot)");
{
  const html = `<body>${carteRemisee({ nom: "Jammer de Natation - Fiti - Noir", slug: "jammer-fiti", promo: "259,0", normal: "299,0", remise: 13 })}</body>`;
  const { deals, rejets } = parseListing(html);
  check("1 deal extrait, 0 rejeté", deals.length === 1 && rejets.length === 0);
  check("titre extrait", deals[0]?.titre === "Jammer de Natation - Fiti - Noir");
  check("prix_promo = 259 (texte de current-price)", deals[0]?.prix_promo === 259);
  check("prix_normal = 299 (texte du prix barré, préfixe sr-only ignoré)", deals[0]?.prix_normal === 299);
  check("categorie fixée Sport", deals[0]?.categorie === "Sport");
  check(
    "image = URL CDN mediadecathlon directe",
    deals[0]?.photo_url === "https://contents.mediadecathlon.com/p2606754/1cr1/k$abc/prod.jpg?format=auto&f=1024x0"
  );
  check("lien = URL produit /p/ réelle", deals[0]?.lien === "https://www.decathlon.ma/p/306807-79688-jammer-fiti.html");
}

console.log("\nparseListing — RÈGLE ABSOLUE : carte sans prix barré -> REJETÉE (jamais de prix deviné)");
{
  const html = `<body>${carteNonRemisee({ nom: "Ballon sans promo", slug: "ballon", prix: 49 })}</body>`;
  const { deals, rejets } = parseListing(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet", rejets.length === 1);
  check("raison mentionne le prix manquant", /prix manquant/.test(rejets[0]?.raison ?? ""));
}

console.log("\nparseListing — prix incohérent (normal < promo) -> REJETÉ");
{
  const html = `<body>${carteRemisee({ nom: "Anomalie prix", slug: "anomalie", promo: "300,0", normal: "200,0", remise: 0 })}</body>`;
  const { deals, rejets } = parseListing(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet pour incohérence", rejets.length === 1 && /incohérent/.test(rejets[0]?.raison ?? ""));
}

console.log("\nparseListing — mélange : 2 valides + 1 sans prix barré sur la même page");
{
  const html = `<body>
    ${carteRemisee({ nom: "Deal A", slug: "deal-a", promo: "119,0", normal: "149,0", remise: 20 })}
    ${carteNonRemisee({ nom: "Sans réduction", slug: "sans-reduc", prix: 49 })}
    ${carteRemisee({ nom: "Deal B", slug: "deal-b", promo: "399,0", normal: "696,0", remise: 43 })}
  </body>`;
  const { deals, rejets } = parseListing(html);
  check("2 deals extraits (les 2 avec prix barré)", deals.length === 2);
  check("1 rejeté (celui sans prix barré)", rejets.length === 1);
  check("les deals retenus sont A et B", deals.map((d) => d.titre).join(",") === "Deal A,Deal B");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
