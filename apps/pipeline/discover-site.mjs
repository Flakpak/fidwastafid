// ============================================================
// FIDWASTAFID — Découverte des API d'un site e-commerce
// Usage :
//   node discover-site.mjs <url> <nom-court>
//   Ex : node discover-site.mjs https://www.bringo.ma/fr_MA/ bringo
//
// Produit 2 fichiers à envoyer à Claude :
//   - <nom-court>-api-log.json  (les appels API interceptés)
//   - <nom-court>-rendu.html    (le HTML final de la page)
// ============================================================

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [, , PAGE_CIBLE, NOM] = process.argv;
if (!PAGE_CIBLE || !NOM) {
  console.error("Usage : node discover-site.mjs <url> <nom-court>");
  console.error("Ex    : node discover-site.mjs https://www.bringo.ma/fr_MA/ bringo");
  process.exit(1);
}
const apiLog = [];

console.log("🚀 Lancement du navigateur (FENÊTRE VISIBLE — observe ce que le site affiche)…");
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Intercepter TOUS les appels réseau applicatifs (JSON ou non)
page.on("response", async (response) => {
  try {
    const url = response.url();
    const type = response.request().resourceType(); // xhr, fetch, document…
    if (!["xhr", "fetch"].includes(type)) return;
    // On ignore le bruit (analytics, pubs, cookies)
    if (/analytics|gtm|google|facebook|cookie|consent|ipify/i.test(url)) return;

    const ct = response.headers()["content-type"] || "";
    const entry = { url, type, status: response.status(), content_type: ct };
    if (ct.includes("json")) {
      const body = await response.text();
      entry.extrait = body.slice(0, 3000);
      entry.taille_totale = body.length;
    }
    apiLog.push(entry);
    console.log(`  📡 ${type.toUpperCase()} : ${url.slice(0, 100)}`);
  } catch {
    /* réponse illisible, on ignore */
  }
});

console.log(`🌐 Ouverture de ${PAGE_CIBLE}…`);
await page.goto(PAGE_CIBLE, { waitUntil: "networkidle", timeout: 60000 });

// Scroll pour déclencher le chargement paresseux des produits
console.log("📜 Scroll de la page pour tout charger…");
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(1500);
}

// Pause interactive : si le site affiche un bandeau cookies ou un choix
// de magasin, clique dessus DANS LA FENÊTRE pendant ces 45 secondes.
console.log("⏸️  45 s de pause : interagis avec la page si besoin (cookies, choix du magasin)…");
await page.waitForTimeout(45000);

// Sauvegardes
writeFileSync(`${NOM}-api-log.json`, JSON.stringify(apiLog, null, 2), "utf8");
writeFileSync(`${NOM}-rendu.html`, await page.content(), "utf8");
await browser.close();

console.log(`\n✅ Terminé : ${apiLog.length} appels API capturés`);
console.log(`→ Fichiers : ${NOM}-api-log.json + ${NOM}-rendu.html`);
console.log(`→ Envoie ${NOM}-api-log.json à Claude (ou un extrait s'il est énorme)`);
