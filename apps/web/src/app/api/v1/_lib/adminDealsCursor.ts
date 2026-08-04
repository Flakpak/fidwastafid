import { encodeCursor, decodeCursor } from "./pagination.js";
import type { DealStatut } from "@fidwastafid/schemas";

/**
 * Curseur de la file admin — même codec que le feed public
 * (`pagination.ts`, `encodeCursor`/`decodeCursor` génériques), forme
 * propre : pas de tri tendance/score ici, et un `statut` au lieu d'une
 * signature de filtres arbitraire — un onglet EST son statut, il n'y a
 * rien d'autre à figer.
 *
 * `recent_asc` (file `en_attente`, plus ancien d'abord — docs/INCIDENTS.md
 * 04/08/2026, une soumission restait invisible derrière un tri par score
 * à égalité départagé par `public_id`, arbitraire) et `remise_desc`
 * (tous les autres onglets, comportement inchangé) sont les deux seuls
 * tris de cette file — jamais choisis par l'appelant, déduits du statut
 * (`triPourStatut`, `_lib/deals.ts`).
 */
export type TriAdmin = "recent_asc" | "remise_desc";

export interface AdminDealsCursor {
  statut: DealStatut;
  tri: TriAdmin;
  value: string;
  publicId: string;
}

function isAdminDealsCursor(value: unknown): value is AdminDealsCursor {
  if (typeof value !== "object" || value === null) return false;
  const { statut, tri, value: v, publicId } = value as Record<string, unknown>;
  return (
    typeof statut === "string" &&
    (tri === "recent_asc" || tri === "remise_desc") &&
    typeof v === "string" &&
    typeof publicId === "string"
  );
}

export function encodeAdminCursor(cursor: AdminDealsCursor): string {
  return encodeCursor(cursor);
}

export function decodeAdminCursor(raw: string): AdminDealsCursor | null {
  return decodeCursor(raw, isAdminDealsCursor);
}
