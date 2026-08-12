import { encodeCursor, decodeCursor } from "./pagination.js";
import type { DealStatut } from "@fidwastafid/schemas";

/**
 * Curseur de la file admin — même codec que le feed public
 * (`pagination.ts`, `encodeCursor`/`decodeCursor` génériques).
 *
 * Six tris explicites (lot filtres/tri, 12/08/2026 — remplace les trois
 * tris fixes déduits du seul statut) : `date_asc`/`date_desc`,
 * `remise_asc`/`remise_desc`, `prix_asc`/`prix_desc`. `triPourStatut()`
 * (`_lib/deals.ts`) fournit le défaut par onglet quand l'appelant n'en
 * choisit pas — `en_attente` reste `date_asc` (docs/INCIDENTS.md,
 * 04/08/2026 : une file d'attente se traite dans l'ordre d'arrivée, un tri
 * à égalité départagé par `public_id` avait laissé une soumission
 * invisible), les autres restent `remise_desc`. `supprime_desc` (onglet «
 * Supprimés », lot 1) n'est jamais choisi par l'appelant, toujours forcé
 * en mode `?supprime=true`.
 *
 * `statut` vaut la chaîne littérale `"supprime"` pour l'onglet Supprimés —
 * ce n'est PAS une valeur de `deals.statut` (qui reste inchangée à la
 * suppression), seulement la clé de partitionnement du curseur : un
 * curseur de l'onglet Supprimés ne doit pas être rejouable sur un onglet
 * de statut, et inversement.
 *
 * `filtres` (lot filtres/tri, 12/08/2026) : signature des filtres actifs
 * (`signatureFiltresAdmin`, `_lib/adminDealsFilters.ts`) — même garantie
 * que `DealsCursor.filtres` côté feed public : un curseur produit sous un
 * jeu de filtres, réinjecté sous un autre, saute ou duplique des lignes en
 * silence. Le serveur le refuse quand la signature ne correspond pas à la
 * requête courante — « tout changement de filtre réinitialise le curseur »
 * ne dépend donc pas de la discipline du client.
 */
export type TriAdmin = "date_asc" | "date_desc" | "remise_asc" | "remise_desc" | "prix_asc" | "prix_desc" | "supprime_desc";

export interface AdminDealsCursor {
  statut: DealStatut | "supprime";
  tri: TriAdmin;
  filtres: string;
  value: string;
  publicId: string;
}

const TRIS_VALIDES = new Set<TriAdmin>([
  "date_asc",
  "date_desc",
  "remise_asc",
  "remise_desc",
  "prix_asc",
  "prix_desc",
  "supprime_desc",
]);

function isAdminDealsCursor(value: unknown): value is AdminDealsCursor {
  if (typeof value !== "object" || value === null) return false;
  const { statut, tri, filtres, value: v, publicId } = value as Record<string, unknown>;
  return (
    typeof statut === "string" &&
    typeof tri === "string" &&
    TRIS_VALIDES.has(tri as TriAdmin) &&
    typeof filtres === "string" &&
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
