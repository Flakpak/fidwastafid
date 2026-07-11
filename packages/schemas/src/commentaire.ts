import { z } from "zod";
import { publicIdSchema } from "./common.js";

/** POST /api/v1/deals/:publicId/commentaires */
export const commentaireInputSchema = z.object({
  contenu: z.string().trim().min(1).max(2000),
});
export type CommentaireInput = z.infer<typeof commentaireInputSchema>;

export const commentaireSchema = z.object({
  contenu: z.string(),
  auteurPublicId: publicIdSchema,
  createdAt: z.string().datetime(),
});
export type Commentaire = z.infer<typeof commentaireSchema>;
