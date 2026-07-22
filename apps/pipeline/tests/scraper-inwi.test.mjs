import { parseOffres } from "../scraper-inwi.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base (job CI "quality",
 * `pnpm test` à la racine). Vérifie le parsing DOM pur (parseOffres) sur des
 * fragments HTML fidèles à la structure réelle de la page inwi "Offres du
 * moment" (cartes h-[354px] server-rendered). Cœur du test : la règle
 * "jamais de prix deviné" (CONTRAT-V1) — une carte sans prix barré
 * exploitable est REJETÉE, jamais complétée avec une valeur inventée.
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

/** Carte promo complète (prix promo + prix barré), structure réelle inwi. */
function carteComplete({ nom, promo, normal }) {
  return `
  <div class="relative flex flex-col h-[354px] bg-white py-4 px-6 rounded-lg">
    <div class="w-max"><span>Promotion</span></div>
    <div class="flex">
      <img src="/_next/image?url=https%3A%2F%2Fapi.inwi.ma%2Fapi%2Fv1%2Fms-content%2Fmedia%2Fcatalog%2Fproduct%2F%2F1%2F0%2F100002814.jpg&w=3840&q=75" alt="${nom}"/>
      <div>
        <span class="text-sm text-magenta font-medium">Samsung</span>
        <h2 class="text-xl font-semibold line-clamp-2">${nom}</h2>
        <div>
          <span>A partir de :</span>
          <h2 class="text-xl text-magenta font-semibold"><span dir="ltr">${promo}</span> DH</h2>
          <div class="flex" data-testid="Procing-promo">
            <p class="text-magenta-secondary font-semibold line-through"><span dir="ltr">${normal}</span> DH</p>
            <span class="bg-[#EC9B22]">-20%</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/** Carte SANS bloc de prix barré (offre "A partir de X" sans réduction). */
function carteSansPrixBarre({ nom, promo }) {
  return `
  <div class="relative flex flex-col h-[354px] bg-white py-4 px-6 rounded-lg">
    <div class="flex">
      <img src="/_next/image?url=https%3A%2F%2Fapi.inwi.ma%2Fx.jpg&w=3840&q=75" alt="${nom}"/>
      <div>
        <span class="text-sm text-magenta font-medium">inwi</span>
        <h2 class="text-xl font-semibold line-clamp-2">${nom}</h2>
        <div>
          <span>A partir de :</span>
          <h2 class="text-xl text-magenta font-semibold"><span dir="ltr">${promo}</span> DH</h2>
        </div>
      </div>
    </div>
  </div>`;
}

console.log("parseOffres — carte promo complète (exemple réel du lot)");
{
  const html = `<body>${carteComplete({ nom: "MI TV STICK FHD 1080P", promo: 349, normal: 595 })}</body>`;
  const { deals, rejets } = parseOffres(html);
  check("1 deal extrait, 0 rejeté", deals.length === 1 && rejets.length === 0);
  check("titre extrait", deals[0]?.titre === "MI TV STICK FHD 1080P");
  check("prix_promo = 349", deals[0]?.prix_promo === 349);
  check("prix_normal = 595 (prix barré)", deals[0]?.prix_normal === 595);
  check("categorie fixée Téléphonie & Internet", deals[0]?.categorie === "Téléphonie & Internet");
  check(
    "image = URL directe api.inwi.ma (proxy /_next/image décodé, jamais le chemin Disallow)",
    deals[0]?.photo_url === "https://api.inwi.ma/api/v1/ms-content/media/catalog/product//1/0/100002814.jpg"
  );
  check("lien = null (jamais une URL détail non vérifiable inventée)", deals[0]?.lien === null);
}

console.log("\nparseOffres — RÈGLE ABSOLUE : carte sans prix barré -> REJETÉE (jamais de prix deviné)");
{
  const html = `<body>${carteSansPrixBarre({ nom: "Forfait Yo 49 DH", promo: 49 })}</body>`;
  const { deals, rejets } = parseOffres(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet", rejets.length === 1);
  check("raison mentionne le prix normal manquant", /normal=\?/.test(rejets[0]?.raison ?? ""));
}

console.log("\nparseOffres — prix incohérent (normal < promo) -> REJETÉ");
{
  const html = `<body>${carteComplete({ nom: "Anomalie prix", promo: 300, normal: 200 })}</body>`;
  const { deals, rejets } = parseOffres(html);
  check("0 deal extrait", deals.length === 0);
  check("1 rejet pour incohérence", rejets.length === 1 && /incohérent/.test(rejets[0]?.raison ?? ""));
}

console.log("\nparseOffres — mélange : 2 valides + 1 sans prix barré sur la même page");
{
  const html = `<body>
    ${carteComplete({ nom: "Deal A", promo: 119, normal: 149 })}
    ${carteSansPrixBarre({ nom: "Sans réduction", promo: 49 })}
    ${carteComplete({ nom: "Deal B", promo: 399, normal: 696 })}
  </body>`;
  const { deals, rejets } = parseOffres(html);
  check("2 deals extraits (les 2 avec prix barré)", deals.length === 2);
  check("1 rejeté (celui sans prix barré)", rejets.length === 1);
  check("les deals retenus sont A et B", deals.map((d) => d.titre).join(",") === "Deal A,Deal B");
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
