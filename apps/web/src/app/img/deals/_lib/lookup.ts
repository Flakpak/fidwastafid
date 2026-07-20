import { query } from "@fidwastafid/db";

/**
 * Partagé par les deux routes de service d'image de deal
 * ([publicId]/route.ts — WebP visiteurs, [publicId]/og.jpg/route.ts — JPEG
 * aperçus sociaux) : même résolution public_id -> image_key, une seule fois.
 */
export const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;

/**
 * Retourne la clé d'image d'un deal, ou null si le public_id est invalide,
 * le deal introuvable, ou sans photo. Aucun filtre de statut : un deal
 * expiré garde son image (URL vivante à vie, CONTRAT-V1 §1) et l'admin doit
 * pouvoir prévisualiser les auto_draft.
 */
export async function resolveDealImageKey(publicId: string): Promise<string | null> {
  if (!PUBLIC_ID_RE.test(publicId)) return null;
  const rows = await query<{ image_key: string | null }>("select image_key from deals where public_id = $1", [
    publicId,
  ]);
  return rows[0]?.image_key ?? null;
}
