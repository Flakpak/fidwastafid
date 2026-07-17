import { z } from "zod";
import { publicIdSchema } from "./common.js";
import { couleurAvatarSchema } from "./enums.js";
import { dealStatutSchema } from "./deal.js";

/** Un des propres deals de l'utilisateur, tel que listé sur /compte —
 *  pas le schéma Deal complet (pas besoin du prix/enseigne/etc. ici). */
export const meDealSchema = z.object({
  publicId: publicIdSchema,
  titre: z.string(),
  statut: dealStatutSchema,
  createdAt: z.string().datetime(),
});
export type MeDeal = z.infer<typeof meDealSchema>;

/** GET /api/v1/me — profil courant, jamais celui d'un autre utilisateur
 *  (pas de :publicId dans l'URL, CONTRAT-V1 §4). L'email n'apparaît que
 *  dans ce schéma de lecture, jamais dans un schéma d'écriture. */
export const meSchema = z.object({
  publicId: publicIdSchema,
  pseudo: z.string(),
  email: z.string().email(),
  couleurAvatar: couleurAvatarSchema,
  dealsCount: z.number().int().nonnegative(),
  votesCount: z.number().int().nonnegative(),
  commentairesCount: z.number().int().nonnegative(),
  /** Enrichissement de lecture du même GET (pas un nouvel endpoint) — la
   *  liste complète, pas de pagination (volume par utilisateur toujours
   *  modeste à cette échelle). */
  mesDeals: z.array(meDealSchema),
});
export type Me = z.infer<typeof meSchema>;

/** PATCH /api/v1/me — mêmes règles que le pseudo d'inscription (page
 *  /inscription : requis, 40 caractères max, pas de contrainte de longueur
 *  minimale au-delà de non-vide). Email volontairement absent : jamais
 *  modifiable via cet endpoint (changement d'email = flux Supabase Auth
 *  dédié, hors périmètre de ce lot). */
export const meUpdateSchema = z.object({
  pseudo: z.string().trim().min(1).max(40).optional(),
  couleurAvatar: couleurAvatarSchema.optional(),
});
export type MeUpdate = z.infer<typeof meUpdateSchema>;
