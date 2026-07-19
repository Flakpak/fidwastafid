// ============================================================
// FIDWASTAFID — Extraction de deals depuis un catalogue
// Usage : node extract-catalogue.mjs <url-ou-chemin> <enseigne>
// Ex    : node extract-catalogue.mjs ./catalogue-bim.pdf BIM
// Sortie: deals-extraits.json (statut: auto_draft)
//
// Prérequis : Node 18+, variable d'env ANTHROPIC_API_KEY
// Portable : aucune dépendance Supabase. L'insertion DB se fait
// dans un script séparé (insert-deals.mjs) via DATABASE_URL.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [, , source, enseigne] = process.argv;
if (!source || !enseigne) {
  console.error("Usage : node extract-catalogue.mjs <url-ou-chemin> <enseigne>");
  process.exit(1);
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Erreur : variable d'environnement ANTHROPIC_API_KEY manquante.");
  process.exit(1);
}

// ---------- 1. Récupérer le catalogue (PDF ou image) ----------
async function loadSource(src) {
  let buffer, contentType;
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Téléchargement échoué : ${res.status}`);
    contentType = res.headers.get("content-type") || "";
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    buffer = readFileSync(src);
    contentType = src.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : src.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
  }
  const isPdf = contentType.includes("pdf");
  return {
    type: isPdf ? "document" : "image",
    media_type: isPdf ? "application/pdf" : contentType || "image/jpeg",
    data: buffer.toString("base64"),
  };
}

// ---------- 2. Prompt d'extraction structurée ----------
const EXTRACTION_PROMPT = `Tu es un extracteur de données pour un site de bons plans marocain.
Analyse ce catalogue promotionnel de l'enseigne "${enseigne}" et extrais CHAQUE produit en promotion.

Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans backticks Markdown.
Format de chaque élément :
{
  "titre": "Nom précis du produit (marque + contenance/taille)",
  "prix_promo": 89,          // nombre en MAD, obligatoire
  "prix_normal": 115,        // nombre en MAD, ou null si absent
  "categorie": "Alimentaire", // parmi: Alimentaire, Électroménager, High-Tech, Maison, Mode, Beauté, Enfants, Autre
  "date_fin": "2026-07-12",  // ISO, ou null si non indiquée
  "description": "1 phrase max, détail utile (conditions, variante)",
  "confiance": "haute"       // "haute" si prix parfaitement lisible et clairement associé au produit, sinon "basse"
}

Règles :
- Ignore les produits sans prix lisible.
- Ne devine JAMAIS un prix : si illisible, ignore le produit.
- CRITIQUE : si un produit ou son prix est COUPÉ par le bord de l'image,
  partiellement masqué, flou ou tronqué → IGNORE ce produit complètement.
  N'utilise JAMAIS le prix d'un produit voisin pour compléter.
- Si tu hésites entre deux prix pour un même produit → confiance: "basse".
- Chaque prix doit être visuellement rattaché à SON produit (même case, même encadré).
- Convertis "89,90 DH" en 89.90 (nombre).
- Si le catalogue indique une période de validité globale, applique-la à tous les produits.`;

// ---------- 3. Appel API Claude ----------
async function extractDeals(sourceBlock) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // Sonnet par défaut (qualité d'extraction prioritaire).
      // Pour tester un autre modèle : $env:CLAUDE_MODEL = "claude-haiku-4-5-20251001"
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: sourceBlock.type,
              source: {
                type: "base64",
                media_type: sourceBlock.media_type,
                data: sourceBlock.data,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Claude : ${res.status} — ${err}`);
  }

  const data = await res.json();
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- 4. Validation + enrichissement ----------
function validateDeals(raw) {
  const now = new Date().toISOString();
  // Les deals à confiance basse sont écartés et loggés — jamais insérés.
  const douteux = raw.filter((d) => d.confiance === "basse");
  if (douteux.length > 0) {
    console.log(`⚠️  ${douteux.length} deal(s) à confiance basse écartés :`);
    douteux.forEach((d) => console.log(`   - ${d.titre} (${d.prix_promo} MAD ?)`));
  }
  return raw
    .filter(
      (d) =>
        d.confiance !== "basse" &&
        d.titre &&
        typeof d.prix_promo === "number" &&
        d.prix_promo > 0 &&
        (d.prix_normal === null || d.prix_normal > d.prix_promo)
    )
    .map((d) => ({
      ...d,
      enseigne,
      ville: "National", // les catalogues GMS sont nationaux par défaut
      statut: "auto_draft",
      source_type: "catalogue",
      extrait_le: now,
    }));
}

// ---------- Main ----------
try {
  console.log(`📄 Chargement du catalogue ${enseigne}…`);
  const sourceBlock = await loadSource(source);

  console.log("🤖 Extraction via Claude…");
  const raw = await extractDeals(sourceBlock);

  const deals = validateDeals(raw);
  const rejetes = raw.length - deals.length;

  // Archivage daté : extractions/AAAA-MM-JJ_HH-mm_<enseigne>.json
  mkdirSync("extractions", { recursive: true });
  const horodatage = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const fichierSortie = `extractions/${horodatage}_${enseigne.toLowerCase().replace(/\s+/g, "-")}.json`;
  writeFileSync(fichierSortie, JSON.stringify(deals, null, 2), "utf8");

  console.log(`✅ ${deals.length} deals extraits (${rejetes} rejetés à la validation)`);
  console.log(`→ Archive : ${fichierSortie}`);
  console.log(`→ Prochaine étape : node insert-deals.mjs ${fichierSortie}`);
} catch (err) {
  console.error("❌ Échec :", err.message);
  process.exit(1);
}
