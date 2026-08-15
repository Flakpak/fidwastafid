import { query } from "@fidwastafid/db";

/**
 * Partagé par les deux routes de service d'image de deal
 * ([publicId]/route.ts — WebP visiteurs, [publicId]/[version]/og.jpg/route.ts
 * — JPEG aperçus sociaux) : même résolution public_id -> image_key, une
 * seule fois.
 */
export const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;

/**
 * Retourne la clé d'image d'un deal, ou null si le public_id est invalide,
 * le deal introuvable, ou sans photo. Aucun filtre de statut : un deal
 * expiré garde son image (URL vivante à vie, CONTRAT-V1 §1) et l'admin doit
 * pouvoir prévisualiser les auto_draft.
 *
 * `supprime_le is null` (lot 1) — cette route n'est protégée par aucune
 * auth (URL publique, `/img/deals/[publicId]`) : un deal supprimé n'y garde
 * pas son image accessible par devinette d'URL, comme partout ailleurs.
 *
 * `image_purgee_le is null` (lot 4) — le fichier Storage a pu être effacé
 * pour de bon (`apps/pipeline/purger-images.mjs`) alors qu'`image_key`
 * reste en base comme trace historique ; sans ce filtre, une restauration
 * après purge ferait tenter cette route de servir un fichier qui n'existe
 * plus.
 */
export async function resolveDealImageKey(publicId: string): Promise<string | null> {
  if (!PUBLIC_ID_RE.test(publicId)) return null;
  const rows = await query<{ image_key: string | null }>(
    "select image_key from deals where public_id = $1 and supprime_le is null and image_purgee_le is null",
    [publicId]
  );
  return rows[0]?.image_key ?? null;
}
