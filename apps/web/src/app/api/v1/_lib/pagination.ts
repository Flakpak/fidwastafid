/**
 * Curseur opaque, jamais offset (CONTRAT-V1 §4). Le champ `tri` est encodé
 * dès maintenant (pas juste "score") : le hot ranking (Phase 4/5) ajoutera
 * d'autres tris sans changer le format de curseur ni casser les liens déjà
 * partagés.
 *
 * `tendance` (Phase 5, tri par défaut) : `value` porte le rang de gravité
 * calculé à la dernière ligne de la page précédente — pas une colonne
 * stockée. Ce rang dépend d'un instant de référence (`asOf`) plutôt que
 * d'un `now()` recalculé à chaque requête : sans ça, deux pages consécutives
 * de la même session de scroll (quelques secondes/minutes d'écart) verraient
 * chacune un `now()` légèrement plus tardif, donc un rang légèrement plus
 * bas pour la ligne charnière — suffisant pour qu'elle repasse sous le seuil
 * du curseur et réapparaisse en double en tête de la page suivante. `asOf`
 * fige l'instant de la première page et voyage dans le curseur vers toutes
 * les pages suivantes : le rang de chaque ligne reste strictement stable le
 * temps d'une session de pagination. Un tout nouveau chargement (sans
 * curseur, ex. session ultérieure) recalcule `asOf` à l'instant courant —
 * l'ordre peut alors différer légèrement d'une session à l'autre : attendu
 * et accepté, pas un bug.
 */
export type TriDeals = "score" | "recent" | "tendance";

export interface DealsCursor {
  tri: TriDeals;
  /** Valeur de la colonne (ou de l'expression, pour `tendance`) de tri à la dernière ligne de la page précédente. */
  value: string;
  /**
   * public_id en tie-break stable — jamais l'id interne bigint : encodé en
   * base64 (pas chiffré), il serait décodable et exposerait quand même la
   * séquence interne (CONTRAT-V1 §1 : jamais exposé, nulle part).
   */
  publicId: string;
  /** Instant de référence figé pour le rang `tendance` — absent pour score/recent. */
  asOf?: string;
  /**
   * Signature des filtres qui ont produit ce curseur (`signatureFiltres`,
   * _lib/dealsFilters.ts). Un curseur est une POSITION dans un jeu de
   * résultats : réinjecté dans un jeu construit avec d'autres filtres, il
   * saute ou duplique des lignes en silence. Le serveur le refuse donc quand
   * la signature ne correspond pas à la requête courante — la garantie
   * « tout changement de filtre réinitialise la pagination » ne dépend plus
   * de la discipline du client.
   */
  filtres: string;
}

export function isDealsCursor(value: unknown): value is DealsCursor {
  if (typeof value !== "object" || value === null) return false;
  const { tri, value: v, publicId, asOf, filtres } = value as Record<string, unknown>;
  return (
    (tri === "score" || tri === "recent" || tri === "tendance") &&
    typeof v === "string" &&
    typeof publicId === "string" &&
    (asOf === undefined || typeof asOf === "string") &&
    typeof filtres === "string"
  );
}

/**
 * Codec générique (base64url d'un JSON) — extrait du feed public pour être
 * réutilisé tel quel par la file admin (`_lib/adminDealsCursor.ts`), qui a
 * sa propre forme de curseur (pas de tri tendance/score, un statut au lieu
 * d'une signature de filtres). Le validateur de forme (`isValid`) reste à
 * la charge de l'appelant : c'est lui qui sait ce qu'un curseur légitime
 * contient pour son propre endpoint.
 */
export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(raw: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
