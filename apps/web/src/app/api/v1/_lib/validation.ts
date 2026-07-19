import type { NextResponse } from "next/server";
import type { ZodError, ZodType, ZodTypeDef } from "zod";
import { apiError } from "./errors.js";

export type ParseResult<T> = { success: true; data: T } | { success: false; response: NextResponse };

/**
 * Premier message par champ (path vide -> "_", erreur au niveau racine, ex.
 * une superRefine sans path précis) — un champ n'a besoin que d'un message à
 * afficher, pas de la liste complète de ce qui cloche dessus. Partagé entre
 * parseJsonBody (corps JSON) et parseCandidate (objet déjà désérialisé, ex.
 * depuis un FormData multipart) — même schéma zod, deux origines de corps.
 */
function zodErrorResponse(error: ZodError): NextResponse {
  const message = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!(path in fields)) fields[path] = issue.message;
  }
  return apiError("VALIDATION_ERROR", message, fields);
}

/**
 * Lit et valide le corps JSON d'une requête contre un schéma zod de
 * packages/schemas. Résultat explicite plutôt qu'une exception : chaque
 * route décide elle-même quoi faire du cas invalide (toujours un early
 * return de `response` ici).
 *
 * Troisième paramètre générique de `ZodType` (Input) explicitement `any` :
 * un schéma avec plusieurs champs `z.preprocess` (Input `unknown` avant
 * transformation) a un `_input` réel qui diverge de son `_output` — avec le
 * défaut `ZodType<T>` (Input = Output = T), l'inférence de T depuis un
 * schéma à plusieurs champs `preprocess` peut tomber sur `unknown` au lieu
 * de la forme réelle (limite constatée empiriquement sur
 * dealAdminUpdateSchema, packages/schemas, qui cumule assez de champs
 * `preprocess` pour la faire basculer). `parseJsonBody` ne se sert jamais du
 * type Input (seul `.safeParse(json: unknown)` est appelé) — le desserrer
 * ici n'affaiblit aucune garantie.
 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { success: false, response: apiError("VALIDATION_ERROR", "Corps JSON invalide.") };
  }

  const result = schema.safeParse(json);
  if (!result.success) return { success: false, response: zodErrorResponse(result.error) };
  return { success: true, data: result.data };
}

/**
 * Même validation que parseJsonBody, mais sur un objet déjà construit (ex.
 * reconstruit depuis un FormData multipart, POST /api/v1/deals avec photo)
 * plutôt que désérialisé depuis un corps JSON — la lecture du corps diffère
 * selon l'origine, la validation zod et le format d'erreur restent
 * identiques dans les deux cas.
 */
export function parseCandidate<T>(candidate: unknown, schema: ZodType<T, ZodTypeDef, unknown>): ParseResult<T> {
  const result = schema.safeParse(candidate);
  if (!result.success) return { success: false, response: zodErrorResponse(result.error) };
  return { success: true, data: result.data };
}
