import { z } from "zod";
import { publicIdSchema } from "./common.js";
import { couleurAvatarSchema } from "./enums.js";

/** POST /api/v1/deals/:publicId/commentaires */
export const commentaireInputSchema = z.object({
  contenu: z.string().trim().min(1).max(2000),
});
export type CommentaireInput = z.infer<typeof commentaireInputSchema>;

export const commentaireSchema = z.object({
  contenu: z.string(),
  /** null si l'auteur a supprimé son compte (espace membre, CONTRAT-V1 §4
   *  amendement 16/07/2026) — le commentaire est conservé, anonymisé. */
  auteurPublicId: publicIdSchema.nullable(),
  /** Pseudo public de l'auteur — donnée publique, cohérent avec le futur
   *  /membre/[pseudo]-[public_id] (CONTRAT-V1 §2, réservé). Jamais l'uuid
   *  interne, jamais l'email. "Membre supprimé" si auteurPublicId est null. */
  pseudo: z.string(),
  couleurAvatar: couleurAvatarSchema,
  createdAt: z.string().datetime(),
});
export type Commentaire = z.infer<typeof commentaireSchema>;
