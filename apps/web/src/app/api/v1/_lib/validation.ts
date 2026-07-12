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
    return { success: false, response: apiError("VALIDATION_ERROR", message) };
  }

  return { success: true, data: result.data };
}
