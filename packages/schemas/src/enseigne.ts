import { z } from "zod";

/**
 * Enseigne — table dédiée (CONTRAT-V1 §3), remplace deals.magasin (texte libre).
 * Slug curé à la main, pas de public_id : liste fermée et administrée par toi,
 * contrairement aux deals qui sont créés en masse par la communauté/le pipeline.
 */
export const enseigneSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug enseigne : minuscules, chiffres, tirets uniquement"),
  nom: z.string().min(1).max(100),
});
export type Enseigne = z.infer<typeof enseigneSchema>;
