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

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS_BY_CODE[code] });
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
