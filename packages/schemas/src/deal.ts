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
 *
 * `maps.google.com` ajouté le 19/07/2026 (bug prod : soumissions rejetées à
 * tort) — variante réelle de partage Google Maps (notamment Android,
 * anciens liens "Partager" du type https://maps.google.com/maps?q=...),
 * distincte de google.com/www.google.com. Sous-domaine dédié aux cartes :
 * pas besoin d'exiger un chemin `/maps` en plus, contrairement à google.com
 * qui sert aussi tout le reste du moteur de recherche.
 */
function isLienMapsAutorise(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname === "maps.app.goo.gl" || url.hostname === "maps.google.com") return true;
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
 *
 * Séparateurs humains courants retirés avant validation (bug prod du
 * 19/07/2026 : un numéro copié tel qu'affiché — "06 12 34 56 78",
 * "+212 6 12 34 56 78", "0612-345-678" — échouait la regex stricte et
 * rejetait la soumission entière sans qu'aucun message n'explique pourquoi).
 * Espaces, points et tirets retirés ; le `+` initial (forme internationale)
 * est conservé, ce n'est jamais un séparateur.
 */
const WHATSAPP_LOCAL_REGEX = /^0[0-9]{9}$/;
const WHATSAPP_INTL_REGEX = /^\+212[0-9]{9}$/;

const whatsappContactSchema = z
  .string()
  .transform((value) => value.replace(/[\s.-]/g, ""))
  .refine(
    (value) => WHATSAPP_LOCAL_REGEX.test(value) || WHATSAPP_INTL_REGEX.test(value),
    "whatsappContact : format attendu +212XXXXXXXXX ou 0XXXXXXXXX (espaces/tirets acceptés à la saisie)."
  )
  .transform((value) => (value.startsWith("0") ? `+212${value.slice(1)}` : value));

/**
 * Un champ facultatif "vide" côté formulaire peut arriver ici comme une
 * chaîne d'un seul espace (espace tapé puis effacé, autofill navigateur) —
 * jamais réellement `undefined`. Sans ce prétraitement, `min(1)`/l'URL/le
 * regex le rejette comme un contenu significatif invalide, plutôt que de le
 * traiter comme absent (bug prod du 19/07/2026 : soumission entière rejetée
 * pour un champ terrain quasi vide). Appliqué uniquement aux champs texte
 * libre optionnels de la soumission terrain — les selects (ville, enseigne)
 * ne sont pas concernés, leur "" est déjà un sentinel géré côté client.
 */
function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/** Champs communs à l'input utilisateur et à la représentation stockée. */
const dealCoreShape = {
  titre: z.string().trim().min(3).max(200),
  /** Optionnel — commerces indépendants/hanouts sans enseigne référencée
   *  (CONTRAT-V1 §3, amendement). Jamais de valeur placeholder type "Autre". */
  enseigneSlug: z.string().min(1).max(60).optional(),
  /** Nom du commerce en texte libre, quand ce n'est pas une enseigne curée
   *  (CONTRAT-V1 §3, amendement du 18/07/2026) — ne génère jamais de page
   *  /enseigne, aucun croisement avec la table enseignes. */
  nomVendeur: z.preprocess(blankToUndefined, z.string().trim().min(1).max(80).optional()),
  adresse: z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional()),
  lienMaps: z.preprocess(blankToUndefined, lienMapsSchema.optional()),
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
  whatsappContact: z.preprocess(blankToUndefined, whatsappContactSchema.optional()),
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
 * Cohérence physique/en_ligne + prix — CONTRAT-V1 §3. Extrait de
 * dealInputSchema (ci-dessous) pour être réutilisé tel quel par le PATCH
 * admin (packages/schemas ne connaît pas la route, mais la route doit
 * appliquer exactement les mêmes règles sur l'état RÉSULTANT d'une édition
 * partielle — pas uniquement sur les champs présents dans le corps de la
 * requête, cf. dealAdminUpdateSchema plus bas).
 */
export function dealCoherenceIssues(val: {
  type: DealType;
  lien?: string;
  prixPromo: number;
  prixNormal?: number;
}): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  if ((val.type === "en_ligne" || val.type === "les_deux") && !val.lien) {
    issues.push({ path: ["lien"], message: "Un lien est requis pour un deal en ligne." });
  }
  if (val.prixNormal !== undefined && val.prixNormal < val.prixPromo) {
    issues.push({ path: ["prixNormal"], message: "Le prix normal doit être supérieur ou égal au prix promo." });
  }
  return issues;
}

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
    for (const issue of dealCoherenceIssues(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
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
 * requis, comme avant) + édition curateur complète du deal (CONTRAT-V1 §3/§4,
 * troisième amendement conscient du 19/07/2026) : l'admin peut corriger
 * n'importe quel champ métier d'un deal (titre, prix, catégorie, type,
 * ville, lien, enseigne...), en plus des champs terrain déjà éditables
 * (nom_vendeur/adresse/lien_maps/whatsapp) et de motiver un rejet.
 *
 * Tous les champs métier restent optionnels ici — un PATCH qui ne fait que
 * changer le statut reste valide (comportement d'origine inchangé). Comme
 * pour les champs terrain, un champ omis laisse la valeur existante intacte
 * (`coalesce` côté route) : pas de moyen de l'effacer, sauf `enseigneSlug`
 * qui distingue explicitement omis (undefined, inchangé) de `null`
 * (déliaison volontaire — "aucune enseigne").
 *
 * PAS de superRefine ici : la cohérence physique/en_ligne (dealCoherenceIssues)
 * ne peut se vérifier que sur l'état RÉSULTANT de la fusion patch+existant
 * (un PATCH peut ne changer que `ville` sans toucher à `type`/`lien`) — cette
 * validation vit donc côté route, après lecture de la ligne existante.
 *
 * Champs jamais éditables ici (immuables ou pilotés par un autre flux) :
 * publicId, score, submitterId, imageKey (volet image-depuis-lien dédié) —
 * absents volontairement de ce schéma.
 */
export const dealAdminUpdateSchema = z.object({
  statut: dealStatutSchema,
  motifRejet: z.string().trim().max(500).optional(),
  nomVendeur: z.preprocess(blankToUndefined, z.string().trim().min(1).max(80).optional()),
  adresse: z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional()),
  lienMaps: z.preprocess(blankToUndefined, lienMapsSchema.optional()),
  whatsappContact: z.preprocess(blankToUndefined, whatsappContactSchema.optional()),
  whatsappPublic: z.boolean().optional(),

  titre: z.string().trim().min(3).max(200).optional(),
  description: z.preprocess(blankToUndefined, z.string().max(2000).optional()),
  prixPromo: z.number().positive().optional(),
  prixNormal: z.number().positive().optional(),
  categorie: categorieSchema.optional(),
  type: dealTypeSchema.optional(),
  ville: villeSchema.optional(),
  dateFin: z.string().date().optional(),
  lien: z.preprocess(blankToUndefined, z.string().url().optional()),
  /** null = déliaison explicite ("aucune enseigne") ; undefined (absent du
   *  corps) = inchangé ; string = résolue en enseigne_id côté route. */
  enseigneSlug: z.string().min(1).max(60).nullable().optional(),
});
export type DealAdminUpdate = z.infer<typeof dealAdminUpdateSchema>;
