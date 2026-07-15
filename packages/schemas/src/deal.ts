import { z } from "zod";
import { publicIdSchema } from "./common.js";
import { villeSchema, categorieSchema } from "./enums.js";

export const dealStatutSchema = z.enum([
  "auto_draft", // exception historique (anglais, déjà câblé pipeline+admin) — CONTRAT-V1 §7
  "en_attente",
  "publie",
  "rejete",
  "expire",
]);
export type DealStatut = z.infer<typeof dealStatutSchema>;

export const dealTypeSchema = z.enum(["physique", "en_ligne", "les_deux"]);
export type DealType = z.infer<typeof dealTypeSchema>;

/** Champs communs à l'input utilisateur et à la représentation stockée. */
const dealCoreShape = {
  titre: z.string().trim().min(3).max(200),
  /** Optionnel — commerces indépendants/hanouts sans enseigne référencée
   *  (CONTRAT-V1 §3, amendement). Jamais de valeur placeholder type "Autre". */
  enseigneSlug: z.string().min(1).max(60).optional(),
  ville: villeSchema.optional(),
  categorie: categorieSchema,
  type: dealTypeSchema,
  prixPromo: z.number().positive(),
  prixNormal: z.number().positive().optional(),
  dateFin: z.string().date().optional(),
  description: z.string().max(2000).optional(),
  lien: z.string().url().optional(),
  /** Clé interne stricte — jamais une URL, format imposé `deals/{public_id}.webp`
   *  (CONTRAT-V1 §6 : "jamais une URL Supabase Storage directe"). L'URL publique
   *  se dérive en /img/deals/[publicId]. Seule écriture autorisée : le pipeline,
   *  qui écrit directement en base — absente de `dealInputSchema` (cf. plus bas),
   *  jamais alimentable via POST /api/v1/deals. */
  imageKey: z
    .string()
    .regex(/^deals\/[a-z0-9]{10}\.webp$/)
    .optional(),
};

/**
 * POST /api/v1/deals — CONTRAT-V1 §3 :
 * - lien requis si type ∈ {en_ligne, les_deux} (un deal en ligne sans lien est inutilisable)
 * - prixNormal, si fourni, doit être ≥ prixPromo
 *
 * `imageKey` exclu volontairement (CONTRAT-V1 §6) : la soumission publique
 * ne peut jamais fixer sa propre clé d'image, seul le pipeline écrit cette
 * colonne, directement en base.
 */
export const dealInputSchema = z
  .object(dealCoreShape)
  .omit({ imageKey: true })
  .superRefine((val, ctx) => {
    if ((val.type === "en_ligne" || val.type === "les_deux") && !val.lien) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lien"],
        message: "Un lien est requis pour un deal en ligne.",
      });
    }
    if (val.prixNormal !== undefined && val.prixNormal < val.prixPromo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prixNormal"],
        message: "Le prix normal doit être supérieur ou égal au prix promo.",
      });
    }
  });
export type DealInput = z.infer<typeof dealInputSchema>;

/** Représentation publique — jamais whatsappContact, jamais l'id interne. */
export const dealSchema = z.object({
  publicId: publicIdSchema,
  ...dealCoreShape,
  statut: dealStatutSchema,
  score: z.number().int(),
  /** null si soumis par le pipeline automatique (pas d'utilisateur humain). */
  submitterPublicId: publicIdSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Deal = z.infer<typeof dealSchema>;

/** Champs additionnels — GET /api/v1/admin/deals uniquement (CONTRAT-V1 §4). */
export const dealAdminSchema = dealSchema.extend({
  whatsappContact: z.string().nullable(),
});
export type DealAdmin = z.infer<typeof dealAdminSchema>;

/** PATCH /api/v1/admin/deals/:publicId */
export const dealStatutUpdateSchema = z.object({
  statut: dealStatutSchema,
});
