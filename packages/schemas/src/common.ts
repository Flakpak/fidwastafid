import { z } from "zod";
import { customAlphabet } from "nanoid";

/**
 * Alphabet nanoid volontairement restreint : chiffres 2-9 + lettres a-z
 * SANS 0, 1, l, o — pour éviter toute confusion visuelle (0/o, 1/l) quand
 * un public_id est lu à voix haute, retapé depuis un SMS ou un lien WhatsApp.
 * 32 caractères = 5 bits d'entropie/caractère : 10 caractères = 50 bits,
 * largement suffisant pour l'échelle de fidwastafid (CONTRAT-V1 §1).
 */
export const PUBLIC_ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
export const PUBLIC_ID_LENGTH = 10;

const PUBLIC_ID_REGEX = new RegExp(`^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);

/** Génère un public_id conforme à publicIdSchema — même alphabet, même longueur. */
export const generatePublicId = customAlphabet(PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH);

/** Identité canonique — deal, user, etc. Jamais l'id séquentiel interne. */
export const publicIdSchema = z
  .string()
  .regex(PUBLIC_ID_REGEX, "public_id invalide : 10 caractères, alphabet restreint");

/** Codes d'erreur API — CONTRAT-V1 §4. SCREAMING_SNAKE_CASE anglais, par convention HTTP. */
export const apiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Forme retournée par getCurrentUser/requireUser/requireAdmin — CONTRAT-V1 §5.
 * `id` est l'uuid interne : présent dans ce type pour un usage strictement
 * serveur (jointures DB), mais ne doit JAMAIS être sérialisé dans une réponse API.
 */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  publicId: publicIdSchema,
  pseudo: z.string(),
  isAdmin: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AuthError";
  }
}

/** Pagination par curseur — jamais offset (CONTRAT-V1 §4). */
export function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
