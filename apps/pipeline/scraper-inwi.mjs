// ============================================================
// FIDWASTAFID — Scraper inwi (Téléphonie & Internet)
// Usage :
//   npm install cheerio
//   node scraper-inwi.mjs
//
// Première source de diversification au-delà de Bringo (spike
// docs/SPIKE-SOURCES.md du 22/07/2026, verdict VERT pour inwi.ma).
// Cible : la page "Offres du moment" — https://inwi.ma/particuliers/
// offres-du-moment (redirige vers /fr/... ; robots.txt autorise ce
// chemin, seuls /particuliers/achat, /api, /cart, /_next sont Disallow).
//
// Sortie : extractions/AAAA-MM-JJ_HH-mm_inwi.json — MÊME format que
// scraper-bringo.mjs, consommé tel quel par insert-deals.mjs (résolution
// enseigne, validation schéma partagé, module image, auto_draft, dédup).
// Aucun deal ne se publie sans validation admin.
//
// RENDU (constat frais du 22/07/2026) : inwi.ma est en Next.js, mais les
// cartes d'offres sont RÉELLEMENT server-rendered dans le DOM (chaque offre
// apparaît deux fois dans le HTML brut : une fois en DOM, une fois dans le
// payload d'hydratation RSC self.__next_f — le spike ne voyait que la
// seconde). cheerio suffit donc, comme pour Bringo : sélecteurs DOM directs,
// pas de rendu JS, pas de parsing du flux RSC. L'objet JSON pricing propre du
// spike (regularPrice/finalPrice) n'existe plus, mais le DOM porte les deux
// prix (prix promo dans le h2 `text-magenta`, prix normal barré dans le bloc
// data-testid="Procing-promo").
//
// RÈGLE ABSOLUE (identique à Bringo / CONTRAT-V1) : jamais de prix deviné.
// Une carte sans prix_normal ET prix_promo clairs et cohérents (normal ≥
// promo) est REJETÉE avec log, jamais insérée avec une valeur inventée.
// ============================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";

const URL_OFFRES = "https://inwi.ma/particuliers/offres-du-moment";
const CATEGORIE = "Téléphonie & Internet"; // enum canonique (packages/schemas)
const ENSEIGNE = "inwi";
const VILLE = "National"; // offres nationales, pas de ville précise

async function fetchPage(url) {
  const res = await fetch(url, {
    // redirect suivi par défaut (fetch: "follow") — la page 307 vers /fr/.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/** "119 DH" / "1 299" → 1299 ; null si aucun chiffre exploitable. */
function parsePrix(texte) {
  if (!texte) return null;
  const chiffres = texte.replace(/[^\d]/g, "");
  return chiffres ? Number(chiffres) : null;
}

/**
 * URL image directe. Le src DOM passe par le proxy Next.js
 * /_next/image?url=<encodé>&w=..&q=.. — ce chemin est Disallow par
 * robots.txt ; on décode l'URL d'origine (api.inwi.ma, hôte sans robots
 * restrictif, image téléchargeable directement par le module image).
 */
function extraireImage($card) {
  const src = $card.find('img[src*="api.inwi.ma"]').first().attr("src") || "";
  const m = src.match(/[?&]url=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  return src.startsWith("http") ? src : null;
}

/**
 * Extrait les cartes promo du DOM. Chaque carte est un conteneur de hauteur
 * fixe `h-[354px]` contenant exactement un bloc de prix barré
 * (data-testid="Procing-promo"). Sélecteurs :
 *  - nom      : h2.line-clamp-2
 *  - promo    : h2.text-magenta > span[dir=ltr]  (font-semibold, distinct du
 *               h2.line-clamp-2 du nom et du span.font-medium de la marque)
 *  - normal   : [data-testid="Procing-promo"] span[dir=ltr]  (prix barré)
 *  - image    : img api.inwi.ma (proxy /_next/image décodé)
 * Retourne { deals, rejets } — rejet = carte sans les deux prix cohérents.
 */
export function parseOffres(html) {
  const $ = cheerio.load(html);
  const deals = [];
  const rejets = [];

  $('div[class*="h-[354px]"]').each((_, card) => {
    const $c = $(card);
    const nom = $c.find("h2.line-clamp-2").first().text().trim() || null;
    const prixPromo = parsePrix($c.find("h2.text-magenta span[dir='ltr']").first().text());
    const prixNormal = parsePrix($c.find('[data-testid="Procing-promo"] span[dir="ltr"]').first().text());
    const photoUrl = extraireImage($c);

    // Rejet prime sur invention (CONTRAT-V1) : les deux prix doivent être
    // présents, entiers positifs, et cohérents (normal ≥ promo). Toute carte
    // qui n'a pas un prix barré exploitable est rejetée, jamais complétée.
    if (!nom) {
      rejets.push({ nom: "(sans nom)", raison: "nom introuvable" });
      return;
    }
    if (!prixPromo || !prixNormal) {
      rejets.push({
        nom,
        raison: `prix manquant (promo=${prixPromo ?? "?"}, normal=${prixNormal ?? "?"})`,
      });
      return;
    }
    if (prixNormal < prixPromo) {
      rejets.push({ nom, raison: `prix incohérent (normal ${prixNormal} < promo ${prixPromo})` });
      return;
    }

    deals.push({
      titre: nom,
      prix_promo: prixPromo,
      prix_normal: prixNormal,
      categorie: CATEGORIE,
      description: null, // aucune description exploitable sur la page listing
      photo_url: photoUrl,
      lien: null, // pages détail client-rendered + catch-all 200 : URL non vérifiable, jamais inventée
      date_fin: null, // pas de date de fin exposée sur le listing
    });
  });

  return { deals, rejets };
}

// ---------- Main ----------
async function main() {
  let html;
  try {
    html = await fetchPage(URL_OFFRES);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  const { deals: extraits, rejets } = parseOffres(html);

  console.log(`📶 inwi — page "Offres du moment"`);
  console.log(`   ${extraits.length} offre(s) retenue(s) | ${rejets.length} rejetée(s)`);
  for (const r of rejets) console.log(`   ⤫ Rejeté : ${r.nom} — ${r.raison}`);

  const now = new Date().toISOString();
  const deals = extraits.map((d) => ({
    ...d,
    enseigne: ENSEIGNE,
    ville: VILLE,
    statut: "auto_draft",
    source_type: "scraper_inwi",
    extrait_le: now,
  }));

  // Archivage daté : extractions/AAAA-MM-JJ_HH-mm_inwi.json (non committé, cf. .gitignore)
  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_inwi.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`\n✅ ${deals.length} deal(s) inwi retenu(s)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
}

// Exécuté seulement lancé directement (pas à l'import par les tests, qui
// importent parseOffres sans déclencher la requête réseau).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
