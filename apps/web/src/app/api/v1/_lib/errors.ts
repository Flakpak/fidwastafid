import { NextResponse } from "next/server";
import { AuthError } from "@fidwastafid/auth";
import type { ApiErrorCode } from "@fidwastafid/schemas";

/** CONTRAT-V1 §4 : format d'erreur unique + mapping code → status HTTP. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
};

/**
 * `fields` (champ → message) : uniquement pour VALIDATION_ERROR issu d'un
 * échec zod — permet au client de marquer individuellement les champs
 * fautifs (cf. apiErrorSchema, packages/schemas). Omis du payload (pas
 * `fields: undefined`) plutôt que toujours présent : un objet vide serait
 * ambigu avec "aucun détail disponible".
 */
export function apiError(code: ApiErrorCode, message: string, fields?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status: STATUS_BY_CODE[code] }
  );
}

/**
 * requireUser/requireAdmin (packages/auth) lèvent AuthError plutôt que de
 * renvoyer une réponse — ce wrapper traduit ça au format API une seule fois,
 * plutôt que de dupliquer un try/catch dans chaque route authentifiée.
 */
export function withAuthErrors<Context>(
  handler: (request: Request, context: Context) => Promise<NextResponse>
) {
  return async (request: Request, context: Context): Promise<NextResponse> => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof AuthError) {
        return apiError(
          err.code,
          err.code === "UNAUTHENTICATED" ? "Authentification requise." : "Accès refusé."
        );
      }
      throw err;
    }
  };
}
