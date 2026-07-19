import type { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { apiError } from "./errors.js";

export type ParseResult<T> = { success: true; data: T } | { success: false; response: NextResponse };

/**
 * Lit et valide le corps JSON d'une requête contre un schéma zod de
 * packages/schemas. Résultat explicite plutôt qu'une exception : chaque
 * route décide elle-même quoi faire du cas invalide (toujours un early
 * return de `response` ici).
 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { success: false, response: apiError("VALIDATION_ERROR", "Corps JSON invalide.") };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
    // Premier message par champ (path vide -> "_", erreur au niveau racine,
    // ex. une superRefine sans path précis) — un champ n'a besoin que d'un
    // message à afficher, pas de la liste complète de ce qui cloche dessus.
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_";
      if (!(path in fields)) fields[path] = issue.message;
    }
    return { success: false, response: apiError("VALIDATION_ERROR", message, fields) };
  }

  return { success: true, data: result.data };
}
