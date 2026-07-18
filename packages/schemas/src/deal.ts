import { z } from "zod";
import { publicIdSchema } from "./common.js";
import { villeSchema, categorieSchema, couleurAvatarSchema } from "./enums.js";

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

/**
 * lien_maps — CONTRAT-V1 §3, amendement du 18/07/2026 : liste blanche stricte,
 * jamais une URL arbitraire stockée comme lien de carte (risque de phishing/
 * redirection tierce déguisée en "adresse Maps"). `www.google.com` est admis
 * en plus de `google.com` : c'est l'hôte réel des liens de partage Google Maps
 * produits en pratique — une liste blanche qui l'exclurait rendrait le champ
 * inutilisable pour l'immense majorité des liens réels.
 */
function isLienMapsAutorise(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname === "maps.app.goo.gl") return true;
  if ((url.hostname === "google.com" || url.hostname === "www.google.com") && url.pathname.startsWith("/maps")) {
    return true;
  }
  if (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")) return true;
  return false;
}

const lienMapsSchema = z
  .string()
  .url()
  .refine(
    isLienMapsAutorise,
    "lienMaps : lien Google Maps attendu (google.com/maps, maps.app.goo.gl ou goo.gl/maps)."
  );

/**
 * whatsapp_contact — format international marocain accepté en deux écritures
 * (+212XXXXXXXXX ou 0XXXXXXXXX), normalisé en +212 au stockage (CONTRAT-V1 §3,
 * amendement du 18/07/2026) : une seule forme canonique en base, indépendamment
 * de ce que le soumetteur a tapé.
 */
const WHATSAPP_LOCAL_REGEX = /^0[0-9]{9}$/;
const WHATSAPP_INTL_REGEX = /^\+212[0-9]{9}$/;

const whatsappContactSchema = z
  .string()
  .trim()
  .refine(
    (value) => WHATSAPP_LOCAL_REGEX.test(value) || WHATSAPP_INTL_REGEX.test(value),
    "whatsappContact : format attendu +212XXXXXXXXX ou 0XXXXXXXXX."
  )
  .transform((value) => (value.startsWith("0") ? `+212${value.slice(1)}` : value));

/** Champs communs à l'input utilisateur et à la représentation stockée. */
const dealCoreShape = {
  titre: z.string().trim().min(3).max(200),
  /** Optionnel — commerces indépendants/hanouts sans enseigne référencée
   *  (CONTRAT-V1 §3, amendement). Jamais de valeur placeholder type "Autre". */
  enseigneSlug: z.string().min(1).max(60).optional(),
  /** Nom du commerce en texte libre, quand ce n'est pas une enseigne curée
   *  (CONTRAT-V1 §3, amendement du 18/07/2026) — ne génère jamais de page
   *  /enseigne, aucun croisement avec la table enseignes. */
  nomVendeur: z.string().trim().min(1).max(80).optional(),
  adresse: z.string().trim().min(1).max(200).optional(),
  lienMaps: lienMapsSchema.optional(),
  ville: villeSchema.optional(),
  categorie: categorieSchema,
  type: dealTypeSchema,
  prixPromo: z.number().positive(),
  prixNormal: z.number().positive().optional(),
  dateFin: z.string().date().optional(),
  description: z.string().max(2000).optional(),
  lien: z.string().url().optional(),
  /** Contact WhatsApp du vendeur — présent en lecture publique uniquement
   *  si whatsappPublic est vrai (CONTRAT-V1 §4, amendement du 18/07/2026),
   *  voir dealSchema/dealAdminSchema plus bas pour l'exposition effective. */
  whatsappContact: whatsappContactSchema.optional(),
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
 * - whatsappPublic=true exige whatsappContact présent (amendement du 18/07/2026) —
 *   règle vérifiée ici, sur une soumission complète : pas de risque de mise à jour
 *   partielle contradictoire comme sur un PATCH.
 *
 * `imageKey` exclu volontairement (CONTRAT-V1 §6) : la soumission publique
 * ne peut jamais fixer sa propre clé d'image, seul le pipeline écrit cette
 * colonne, directement en base.
 */
export const dealInputSchema = z
  .object({ ...dealCoreShape, whatsappPublic: z.boolean().default(false) })
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
    if (val.whatsappPublic && !val.whatsappContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["whatsappContact"],
        message: "whatsappContact est requis quand whatsappPublic est vrai.",
      });
    }
  });
export type DealInput = z.infer<typeof dealInputSchema>;

/**
 * Représentation publique. `whatsappContact` hérité de dealCoreShape reste
 * optionnel ici à dessein : présent uniquement si le soumetteur a consenti
 * (whatsappPublic=true, CONTRAT-V1 §4 amendement du 18/07/2026) — construit
 * par toDeal() (apps/web), jamais `null`, absent quand non consenti.
 */
export const dealSchema = z.object({
  publicId: publicIdSchema,
  ...dealCoreShape,
  /** Nom propre de l'enseigne (ex. "Marjane") — dérivé de la table
   *  enseignes via enseigneSlug, lecture seule. Volontairement hors de
   *  dealCoreShape : n'apparaît jamais dans dealInputSchema, un
   *  utilisateur ne peut pas soumettre son propre nom d'enseigne. */
  enseigneNom: z.string().optional(),
  statut: dealStatutSchema,
  score: z.number().int(),
  /** null si soumis par le pipeline automatique (pas d'utilisateur humain). */
  submitterPublicId: publicIdSchema.nullable(),
  /** Pseudo du soumetteur — même null-si-pipeline, lecture seule, jamais
   *  dans dealInputSchema (même pattern que enseigneNom). */
  submitterPseudo: z.string().nullable(),
  /** Couleur d'avatar du soumetteur — espace membre (CONTRAT-V1 §4,
   *  amendement 16/07/2026), même null-si-pipeline que submitterPseudo. */
  submitterCouleurAvatar: couleurAvatarSchema.nullable(),
  /** Nombre de commentaires — agrégat lecture seule, jamais dans dealInputSchema. */
  commentairesCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Deal = z.infer<typeof dealSchema>;

/**
 * Champs additionnels — GET /api/v1/admin/deals uniquement (CONTRAT-V1 §4).
 * whatsappContact/whatsappPublic toujours présents ici (jamais d'exposition
 * conditionnelle en admin) ; motifRejet — retour du curateur, également
 * visible par le soumetteur via meDealSchema (packages/schemas/src/me.ts).
 */
export const dealAdminSchema = dealSchema.extend({
  whatsappContact: z.string().nullable(),
  whatsappPublic: z.boolean(),
  motifRejet: z.string().nullable(),
});
export type DealAdmin = z.infer<typeof dealAdminSchema>;

/**
 * PATCH /api/v1/admin/deals/:publicId — changement de statut (toujours
 * requis, comme avant) + édition curateur des champs terrain (CONTRAT-V1 §3,
 * amendement du 18/07/2026) : l'admin peut enrichir un deal du pipeline
 * (nom_vendeur/adresse/lien_maps/whatsapp) sans passer par une resoumission,
 * et motiver un rejet. Tous les champs terrain restent optionnels — un PATCH
 * qui ne fait que changer le statut reste valide, comme avant cet amendement.
 */
export const dealStatutUpdateSchema = z.object({
  statut: dealStatutSchema,
  motifRejet: z.string().trim().max(500).optional(),
  nomVendeur: z.string().trim().min(1).max(80).optional(),
  adresse: z.string().trim().min(1).max(200).optional(),
  lienMaps: lienMapsSchema.optional(),
  whatsappContact: whatsappContactSchema.optional(),
  whatsappPublic: z.boolean().optional(),
});
