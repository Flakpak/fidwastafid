import sharp from "sharp";

/**
 * Traitement + stockage d'image de deal — commun aux deux voies
 * d'alimentation (POST .../image-depuis-lien, POST .../image, CONTRAT-V1
 * §4) : ré-encodage sharp (resize ≤1200px, WebP q80) puis upload Supabase
 * Storage sous `deals/{publicId}.webp`. Un seul point d'entrée pour que les
 * deux endpoints produisent exactement le même résultat (même convention de
 * clé, même bucket, mêmes garanties de sécurité sur le fichier stocké).
 */

const MAX_IMAGE_DIMENSION = 1200;
const WEBP_QUALITY = 80;

export class InvalidImageError extends Error {}
export class ImageProcessingError extends Error {}

/**
 * Détection du type réel par les premiers octets (magic bytes) — jamais le
 * Content-Type déclaré (header HTTP pour image-depuis-lien, extension/type
 * MIME du navigateur pour l'upload manuel), arbitrairement falsifiable dans
 * les deux cas. Un exécutable renommé `.jpg` ou envoyé avec
 * `Content-Type: image/jpeg` est rejeté ici, avant tout traitement sharp.
 */
export function sniffImageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function storageHeaders(extra: HeadersInit = {}): HeadersInit {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey, ...extra };
}

/**
 * Upload vers Supabase Storage — même approche fetch nu que
 * apps/web/src/app/img/deals/[publicId]/route.ts (CONTRAT-V1 §6). URL
 * construite depuis SUPABASE_URL (variable d'env serveur, jamais une
 * entrée utilisateur) : pas de garde SSRF ici. `x-upsert: true` : le deal
 * peut déjà avoir une image (remplacement, pas seulement création).
 */
async function uploadDealImage(imageKey: string, buffer: Buffer): Promise<void> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/deals-images/${imageKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "image/webp", "x-upsert": "true" }),
    // `Buffer` (sous-classe de Uint8Array à paramètre générique) ne matche
    // pas structurellement BodyInit selon les types lib.dom — vue plate en
    // Uint8Array, acceptée par fetch() aussi bien à l'exécution qu'aux types.
    body: new Uint8Array(buffer),
  });
  if (!response.ok) {
    throw new Error(`Upload Supabase Storage échoué (HTTP ${response.status}).`);
  }
}

/**
 * Valide (magic bytes), ré-encode (sharp, métadonnées EXIF supprimées par
 * défaut faute de `keepMetadata`) et stocke une image de deal. Le fichier
 * ORIGINAL n'est jamais conservé — seul le WebP ré-encodé l'est, ce qui
 * neutralise tout contenu malveillant embarqué dans le fichier reçu
 * (payload caché après les données image, exploit visant un lecteur
 * d'image tiers, etc.) : sharp ne fait que relire les pixels décodés et en
 * réémettre un nouveau fichier propre.
 *
 * @throws {InvalidImageError} type de fichier non reconnu (jpeg/png/webp)
 * @throws {ImageProcessingError} sharp échoue à décoder/traiter les octets
 */
export async function processAndStoreDealImage(publicId: string, rawImage: Buffer): Promise<string> {
  if (!sniffImageMime(rawImage)) {
    throw new InvalidImageError("Type de fichier non reconnu (jpeg/png/webp attendu).");
  }

  let processed: Buffer;
  try {
    processed = await sharp(rawImage)
      .rotate() // auto-oriente selon l'EXIF avant que webp() ne l'efface
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new ImageProcessingError("Traitement de l'image impossible.");
  }

  // `deals/{publicId}.webp` — même clé qu'un remplacement précédent.
  // Limite acceptée (CONTRAT-V1 §6) : la route proxy /img/deals/[publicId]
  // sert avec s-maxage=2592000 (30 jours) — si ce deal avait DÉJÀ une image
  // en cache edge, le remplacement peut tarder à apparaître publiquement
  // jusqu'à 30 jours. Non problématique pour le cas initial (deal sans
  // image : aucun cache préexistant à purger) ; limite acceptée pour le cas
  // remplacement, aucune purge active n'est faite ici.
  const imageKey = `deals/${publicId}.webp`;
  await uploadDealImage(imageKey, processed);
  return imageKey;
}
