/**
 * Curseur opaque, jamais offset (CONTRAT-V1 §4). Le champ `tri` est encodé
 * dès maintenant (pas juste "score") : le hot ranking (Phase 4/5) ajoutera
 * d'autres tris sans changer le format de curseur ni casser les liens déjà
 * partagés.
 */
export type TriDeals = "score" | "recent";

export interface DealsCursor {
  tri: TriDeals;
  /** Valeur de la colonne de tri à la dernière ligne de la page précédente. */
  value: string;
  /**
   * public_id en tie-break stable — jamais l'id interne bigint : encodé en
   * base64 (pas chiffré), il serait décodable et exposerait quand même la
   * séquence interne (CONTRAT-V1 §1 : jamais exposé, nulle part).
   */
  publicId: string;
}

export function encodeCursor(cursor: DealsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function isDealsCursor(value: unknown): value is DealsCursor {
  if (typeof value !== "object" || value === null) return false;
  const { tri, value: v, publicId } = value as Record<string, unknown>;
  return (tri === "score" || tri === "recent") && typeof v === "string" && typeof publicId === "string";
}

export function decodeCursor(raw: string): DealsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return isDealsCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
