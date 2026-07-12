import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  dealSchema,
  dealInputSchema,
  dealAdminSchema,
  dealStatutUpdateSchema,
  enseigneSchema,
  voteInputSchema,
  commentaireInputSchema,
  commentaireSchema,
  apiErrorSchema,
} from "@fidwastafid/schemas";

/**
 * Génère openapi.json depuis les schémas zod de packages/schemas — pas de
 * définition manuelle en double. Reflète la liste fermée d'endpoints de
 * CONTRAT-V1 §4, rien de plus, rien de moins.
 */
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const Deal = registry.register("Deal", dealSchema);
const DealAdmin = registry.register("DealAdmin", dealAdminSchema);
const DealInput = registry.register("DealInput", dealInputSchema);
const DealStatutUpdate = registry.register("DealStatutUpdate", dealStatutUpdateSchema);
const Enseigne = registry.register("Enseigne", enseigneSchema);
const VoteInput = registry.register("VoteInput", voteInputSchema);
const CommentaireInput = registry.register("CommentaireInput", commentaireInputSchema);
const Commentaire = registry.register("Commentaire", commentaireSchema);
const ApiError = registry.register("ApiError", apiErrorSchema);

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "Supabase Auth JWT — ou cookie de session pour le web (CONTRAT-V1 §5).",
});

function paginated(itemSchema: z.ZodTypeAny, name: string) {
  return registry.register(
    name,
    z.object({ data: z.array(itemSchema), nextCursor: z.string().nullable() })
  );
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiError } },
});

// ---- Public, sans auth ----

registry.registerPath({
  method: "get",
  path: "/deals",
  summary: "Liste des deals (filtres, pagination par curseur)",
  request: {
    query: z.object({
      statut: z.string().optional().openapi({ description: "publie|expire — publie par défaut" }),
      enseigne: z.string().optional(),
      ville: z.string().optional(),
      categorie: z.string().optional(),
      type: z.string().optional(),
      tri: z.string().optional().openapi({ description: "score|recent — score par défaut" }),
      cursor: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginated(Deal, "DealPage") } } },
    400: errorResponse("Curseur invalide"),
  },
  tags: ["deals"],
});

registry.registerPath({
  method: "get",
  path: "/deals/{publicId}",
  summary: "Détail d'un deal (jamais 404 sur un deal expiré — CONTRAT-V1 §1)",
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Deal } } },
    404: errorResponse("Deal introuvable ou non public"),
  },
  tags: ["deals"],
});

registry.registerPath({
  method: "get",
  path: "/enseignes",
  summary: "Liste des enseignes",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ data: z.array(Enseigne) }) } },
    },
  },
  tags: ["enseignes"],
});

// ---- Authentifié (requireUser) ----

registry.registerPath({
  method: "post",
  path: "/deals",
  summary: "Soumission communautaire — toujours créé en_attente",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: z.object({
      "X-Turnstile-Token": z.string().optional().openapi({ description: "Cloudflare Turnstile" }),
    }),
    body: { content: { "application/json": { schema: DealInput } } },
  },
  responses: {
    201: { description: "Créé", content: { "application/json": { schema: Deal } } },
    400: errorResponse("Corps invalide ou vérification anti-robot échouée"),
    401: errorResponse("Authentification requise"),
    429: errorResponse("Trop de soumissions"),
  },
  tags: ["deals"],
});

registry.registerPath({
  method: "post",
  path: "/deals/{publicId}/votes",
  summary: "Voter (upsert — un seul vote courant par utilisateur/deal)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    body: { content: { "application/json": { schema: VoteInput } } },
  },
  responses: {
    200: { description: "OK — score recalculé", content: { "application/json": { schema: Deal } } },
    400: errorResponse("Corps invalide"),
    401: errorResponse("Authentification requise"),
    404: errorResponse("Deal introuvable"),
    429: errorResponse("Trop de votes"),
  },
  tags: ["deals"],
});

registry.registerPath({
  method: "delete",
  path: "/deals/{publicId}/votes",
  summary: "Retirer son vote",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: { description: "OK — score recalculé", content: { "application/json": { schema: Deal } } },
    401: errorResponse("Authentification requise"),
    404: errorResponse("Deal introuvable"),
  },
  tags: ["deals"],
});

registry.registerPath({
  method: "post",
  path: "/deals/{publicId}/commentaires",
  summary: "Commenter un deal public (publie/expire)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    body: { content: { "application/json": { schema: CommentaireInput } } },
  },
  responses: {
    201: { description: "Créé", content: { "application/json": { schema: Commentaire } } },
    400: errorResponse("Corps invalide"),
    401: errorResponse("Authentification requise"),
    404: errorResponse("Deal introuvable"),
    429: errorResponse("Trop de commentaires"),
  },
  tags: ["deals"],
});

// ---- Admin (requireAdmin) ----

registry.registerPath({
  method: "get",
  path: "/admin/deals",
  summary: "Pipeline complet — auto_draft toujours en tête. Inclut whatsappContact.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ statut: z.string().optional() }) },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ data: z.array(DealAdmin) }) } },
    },
    403: errorResponse("Accès refusé (non-admin)"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "patch",
  path: "/admin/deals/{publicId}",
  summary: "Changer le statut d'un deal (tracé dans journal_audit)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    body: { content: { "application/json": { schema: DealStatutUpdate } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: DealAdmin } } },
    400: errorResponse("Statut invalide"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/bulk",
  summary: "Action groupée — statut appliqué à un lot de public_id (max 100)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            publicIds: z.array(z.string()).min(1).max(100),
            statut: dealStatutUpdateSchema.shape.statut,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "OK — public_id inconnus ignorés silencieusement",
      content: { "application/json": { schema: z.object({ updated: z.array(z.string()) }) } },
    },
    400: errorResponse("Corps invalide"),
    403: errorResponse("Accès refusé (non-admin)"),
  },
  tags: ["admin"],
});

const generator = new OpenApiGeneratorV31(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "Fidwastafid API v1",
    version: "1.0.0",
    description: "Généré depuis packages/schemas — voir docs/CONTRAT-V1.md §4 pour le contrat de référence.",
  },
  servers: [{ url: "/api/v1" }],
});

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "openapi.json");
writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n");
console.log(`openapi.json écrit (${Object.keys(document.paths ?? {}).length} chemins).`);
