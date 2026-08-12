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
 * à égalité départagé par `public_id`, arbitraire), `remise_desc`
 * (tous les autres onglets, comportement inchangé) et `supprime_desc`
 * (onglet « Supprimés », lot 1 — plus récemment supprimé d'abord) sont les
 * trois seuls tris de cette file — jamais choisis par l'appelant, déduits
 * du statut ou du mode (`triPourStatut`, `_lib/deals.ts`).
 *
 * `statut` vaut la chaîne littérale `"supprime"` pour l'onglet Supprimés —
 * ce n'est PAS une valeur de `deals.statut` (qui reste inchangée à la
 * suppression), seulement la clé de partitionnement du curseur : un
 * curseur de l'onglet Supprimés ne doit pas être rejouable sur un onglet
 * de statut, et inversement.
 */
export type TriAdmin = "recent_asc" | "remise_desc" | "supprime_desc";

export interface AdminDealsCursor {
  statut: DealStatut | "supprime";
  tri: TriAdmin;
  value: string;
  publicId: string;
}

function isAdminDealsCursor(value: unknown): value is AdminDealsCursor {
  if (typeof value !== "object" || value === null) return false;
  const { statut, tri, value: v, publicId } = value as Record<string, unknown>;
  return (
    typeof statut === "string" &&
    (tri === "recent_asc" || tri === "remise_desc" || tri === "supprime_desc") &&
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
