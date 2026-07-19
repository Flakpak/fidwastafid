// ============================================================
// FIDWASTAFID — Module image du pipeline (CONTRAT-V1 §6)
//
// Exporte traiterImage(deal, publicId, pool), appelée par insert-deals.mjs
// APRÈS l'insertion réussie de chaque deal ayant un photo_url. Périmètre :
// deals Bringo uniquement — les deals catalogue (extract-catalogue.mjs)
// n'ont pas d'image individuelle extraite (décision actée, cf. audit du
// 2026-07-15 : Claude ne reçoit que l'image de la page entière, aucune
// coordonnée par produit n'est disponible).
//
// Symétrie voulue avec la route proxy du dépôt frère
// (apps/web/src/app/img/deals/[publicId]/route.ts) : même bucket
// (deals-images), même clé (deals/{publicId}.webp), même fetch natif sans
// SDK Supabase — c'est la même paire upload/lecture, juste aux deux
// extrémités du pipeline.
//
// Aucune erreur ici ne doit jamais faire échouer l'insertion d'un deal :
// une image ratée laisse image_key à NULL et le traitement continue.
// ============================================================

import sharp from "sharp";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
const MAX_COTE = 1200; // px, côté le plus long
const WEBP_QUALITE = 80;

/**
 * Retire un segment /cache/<filtre>/ d'une URL Sylius (ex. sylius_medium)
 * pour tenter l'image originale plutôt que le thumbnail de listing —
 * optimisation d'ingestion pure, la valeur photo_url archivée par
 * scraper-bringo.mjs n'est jamais modifiée (cf. audit du 2026-07-15).
 * Motif générique /cache/[^/]+/ uniquement, rien de codé en dur au-delà :
 * si le motif n'apparaît pas, l'URL revient inchangée.
 */
function enleverSegmentCache(url) {
  return url.replace(/\/cache\/[^/]+\//, "/");
}

/**
 * Télécharge photo_url avec garde-fous : timeout (AbortController), taille
 * max vérifiée sur Content-Length ET sur le flux réel (un serveur peut
 * mentir ou omettre l'en-tête), Content-Type qui doit commencer par
 * "image/". Retourne un Buffer ou lève.
 */
async function telechargerImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`content-type inattendu : "${contentType || "(absent)"}"`);
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_BYTES) {
      throw new Error(`taille annoncée ${contentLength} octets > ${MAX_BYTES}`);
    }

    if (!res.body) throw new Error("réponse sans corps");
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`flux dépasse ${MAX_BYTES} octets — abandon`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

/** Redimensionne (jamais d'agrandissement) + convertit en WebP qualité 80. */
async function traiterAvecSharp(buffer) {
  return sharp(buffer)
    .resize(MAX_COTE, MAX_COTE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITE })
    .toBuffer();
}

/**
 * Nouvelles clés Supabase (sb_secret_...) : header `apikey` uniquement,
 * jamais `Authorization: Bearer` — ce ne sont pas des JWT (alignement sur
 * la migration du monorepo frère, voir
 * ../fidwastafid/docs/MIGRATION-CLES-SUPABASE.md). Migration terminée
 * (19/07/2026) : plus de fallback vers l'ancienne `service_role`,
 * désactivée côté Dashboard Supabase.
 */
function storageAuthHeaders() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey };
}

/**
 * Upload fetch natif — LE point à réécrire le jour d'un changement de
 * backend de stockage (même logique que fetchImageFromStorage côté route
 * proxy du dépôt frère, en sens inverse).
 */
async function uploaderVersStorage(publicId, webpBuffer) {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/deals-images/deals/${publicId}.webp`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...storageAuthHeaders(),
      "Content-Type": "image/webp",
    },
    body: webpBuffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload storage ${res.status} : ${body.slice(0, 200)}`);
  }
}

/**
 * Storage disponible si SUPABASE_URL + SUPABASE_SECRET_KEY — exporté pour
 * que le garde principal d'insert-deals.mjs (avertissement one-shot en
 * début de run) partage exactement la même condition que le garde de
 * dernier recours ci-dessous, sans dupliquer la logique à deux endroits.
 * Migration terminée (19/07/2026) : plus de repli sur SUPABASE_SERVICE_ROLE_KEY.
 */
export function storageDisponible() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/**
 * pool : le client pg déjà ouvert par insert-deals.mjs (pg.Client), passé
 * tel quel — Client et Pool partagent la même interface .query(), donc ce
 * paramètre fonctionne avec l'un ou l'autre sans adaptation.
 */
export async function traiterImage(deal, publicId, pool) {
  if (!deal.photo_url) return;

  if (!storageDisponible()) {
    // Garde de dernier recours : le garde principal (avertissement one-shot
    // en début de run) vit dans insert-deals.mjs et évite normalement
    // d'arriver jusqu'ici. On n'insiste pas, on abandonne proprement.
    console.log(`  🖼️  [${publicId}] image ignorée (variables storage manquantes)`);
    return;
  }

  const urlOriginale = enleverSegmentCache(deal.photo_url);
  const aUneVarianteOriginale = urlOriginale !== deal.photo_url;

  let etape = "téléchargement";
  try {
    let original;
    if (aUneVarianteOriginale) {
      try {
        original = await telechargerImage(urlOriginale);
        console.log(`  🖼️  [${publicId}] source originale utilisée (segment cache retiré)`);
      } catch (err) {
        console.log(`  🖼️  [${publicId}] originale indisponible (${err.message}) — repli sur le thumbnail`);
        original = await telechargerImage(deal.photo_url);
        console.log(`  🖼️  [${publicId}] thumbnail utilisé (fallback)`);
      }
    } else {
      original = await telechargerImage(deal.photo_url);
      console.log(`  🖼️  [${publicId}] URL d'origine utilisée (aucun segment cache détecté)`);
    }

    etape = "traitement sharp";
    const webp = await traiterAvecSharp(original);

    etape = "upload storage";
    await uploaderVersStorage(publicId, webp);

    etape = "mise à jour image_key";
    await pool.query("update deals set image_key = $1 where public_id = $2", [
      `deals/${publicId}.webp`,
      publicId,
    ]);

    console.log(`  🖼️  [${publicId}] image traitée (${webp.length} octets webp).`);
  } catch (err) {
    // image_key reste NULL — une image ratée ne bloque jamais le deal, qui
    // reste inséré et valide sans image.
    console.log(`  🖼️  ⚠️  [${publicId}] échec image (${etape}) : ${err.message}`);
  }
}
