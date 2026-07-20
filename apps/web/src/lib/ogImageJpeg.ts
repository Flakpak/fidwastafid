import sharp from "sharp";

/**
 * Variante JPEG des images de deal pour les aperçus sociaux (WhatsApp/
 * Facebook) — incident du 20/07/2026 : aucune balise og:image n'était émise
 * pour les pages deal (generateMetadata ne renseignait pas `openGraph.images`,
 * cf. seo.ts/page.tsx). Le format WebP servi aux visiteurs du site
 * (apps/web/src/app/api/v1/_lib/dealImage.ts) est par ailleurs connu pour
 * être mal ou pas géré par le crawler WhatsApp/Facebook — pas re-testable
 * en conditions réelles depuis cet environnement (aucun accès à un vrai
 * partage WhatsApp), donc traité en précaution documentée plutôt qu'en fait
 * vérifié : on sert un JPEG dédié à l'og, jamais aux visiteurs normaux du
 * site (qui continuent de recevoir le WebP via /img/deals/[publicId]).
 *
 * Pas de resize ici : la taille ≤1200px est déjà garantie à l'upload
 * (MAX_IMAGE_DIMENSION dans dealImage.ts) — un simple ré-encodage de format.
 */
const OG_JPEG_QUALITY = 80;

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Dimensions réelles d'une image déjà stockée — lecture seule des métadonnées
 * (pas de ré-encodage), utilisée par generateMetadata pour og:image:width/
 * height. Nécessairement différentes d'un deal à l'autre : le resize à
 * l'upload est `fit: "inside"` (préserve le ratio, ne force jamais un carré).
 */
export async function imageDimensions(bytes: Buffer): Promise<ImageDimensions> {
  const { width, height } = await sharp(bytes).metadata();
  if (!width || !height) throw new Error("Dimensions d'image introuvables.");
  return { width, height };
}

/** Ré-encode en JPEG — utilisée par la route /img/deals/[publicId]?format=jpeg. */
export async function toOgImageJpeg(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).jpeg({ quality: OG_JPEG_QUALITY }).toBuffer();
}
