import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  dealSchema,
  dealInputSchema,
  dealAdminSchema,
  dealAdminUpdateSchema,
  enseigneSchema,
  voteInputSchema,
  mesVotesResponseSchema,
  commentaireInputSchema,
  commentaireSchema,
  meSchema,
  meUpdateSchema,
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
const DealAdminUpdate = registry.register("DealAdminUpdate", dealAdminUpdateSchema);
const Enseigne = registry.register("Enseigne", enseigneSchema);
const VoteInput = registry.register("VoteInput", voteInputSchema);
const CommentaireInput = registry.register("CommentaireInput", commentaireInputSchema);
const Commentaire = registry.register("Commentaire", commentaireSchema);
const MesVotes = registry.register("MesVotes", mesVotesResponseSchema);
const Me = registry.register("Me", meSchema);
const MeUpdate = registry.register("MeUpdate", meUpdateSchema);
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
      ville: z
        .string()
        .optional()
        .openapi({ description: "Cette ville + les deals nationaux + les deals disponibles en ligne" }),
      categorie: z.string().optional(),
      type: z.string().optional().openapi({ description: "physique|en_ligne — disponibilité, pas égalité stricte" }),
      q: z.string().optional().openapi({ description: "Recherche sur le titre et l'enseigne" }),
      tri: z.string().optional().openapi({ description: "tendance|score|recent — tendance par défaut" }),
      cursor: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginated(Deal, "DealPage") } } },
    400: errorResponse("Curseur invalide pour ce tri ou pour ces filtres"),
  },
  tags: ["deals"],
});

const CompteDeals = registry.register("CompteDeals", z.object({ total: z.number().int() }));

registry.registerPath({
  method: "get",
  path: "/deals/compte",
  summary: "Nombre de deals correspondant aux filtres (CONTRAT-V1 §4, septième amendement)",
  description:
    "Mêmes filtres que GET /deals, sans pagination. Les prédicats sont partagés avec GET /deals : " +
    "le total annonce exactement ce que la liste renverra.",
  request: {
    query: z.object({
      statut: z.string().optional(),
      enseigne: z.string().optional(),
      ville: z.string().optional(),
      categorie: z.string().optional(),
      type: z.string().optional(),
      q: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: CompteDeals } } },
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
  summary:
    "Soumission communautaire — toujours créé en_attente. Accepte aussi multipart/form-data avec un " +
    "champ \"image\" optionnel (photo terrain, jpeg/png/webp, 5 Mo max — mêmes champs que le JSON, en valeurs texte).",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: z.object({
      "X-Turnstile-Token": z.string().optional().openapi({ description: "Cloudflare Turnstile" }),
    }),
    body: {
      content: {
        "application/json": { schema: DealInput },
        "multipart/form-data": { schema: DealInput },
      },
    },
  },
  responses: {
    201: { description: "Créé", content: { "application/json": { schema: Deal } } },
    400: errorResponse("Corps invalide, vérification anti-robot échouée, ou image invalide/trop volumineuse"),
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
  method: "get",
  path: "/deals/mes-votes",
  summary: "Vote courant de l'appelant pour les deals demandés (CONTRAT-V1 §4, seizième amendement)",
  description:
    "Absent d'une clé = pas de vote (émis puis retiré, ou jamais émis). Jamais dans la charge utile " +
    "de GET /deals : le vote courant dépend de qui regarde, pas du deal — endpoint séparé pour ne " +
    "jamais rendre ce payload dépendant de l'appelant.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({ ids: z.string().openapi({ description: "publicId séparés par des virgules, 50 max" }) }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: MesVotes } } },
    400: errorResponse("ids manquant, vide, trop nombreux, ou identifiant invalide"),
    401: errorResponse("Authentification requise"),
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

registry.registerPath({
  method: "get",
  path: "/me",
  summary: "Profil de l'utilisateur courant (espace membre, CONTRAT-V1 §4 amendement 16/07/2026)",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Me } } },
    401: errorResponse("Authentification requise"),
  },
  tags: ["me"],
});

registry.registerPath({
  method: "patch",
  path: "/me",
  summary: "Rectification du profil courant (pseudo et/ou couleur d'avatar)",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: MeUpdate } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Me } } },
    400: errorResponse("Corps invalide ou pseudo déjà pris"),
    401: errorResponse("Authentification requise"),
    429: errorResponse("Trop de modifications"),
  },
  tags: ["me"],
});

registry.registerPath({
  method: "delete",
  path: "/me",
  summary:
    "Suppression du compte — commentaires anonymisés, votes supprimés (scores recalculés), deals soumis conservés (submitter_id null), compte Supabase Auth supprimé",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
    },
    401: errorResponse("Authentification requise"),
  },
  tags: ["me"],
});

// ---- Admin (requireAdmin) ----

registry.registerPath({
  method: "get",
  path: "/admin/deals",
  summary: "File admin d'UN statut, pagination par curseur (CONTRAT-V1 §4, neuvième amendement conscient)",
  description:
    "statut est obligatoire : un onglet interroge son statut, jamais la table entière (avant ce lot, " +
    "GET /admin/deals chargeait tous statuts confondus sous un LIMIT global, filtrés/triés côté client — " +
    "une soumission en_attente récente pouvait rester hors de la fenêtre du LIMIT, invisible sans qu'aucun " +
    "filtre ne l'exclue réellement, docs/INCIDENTS.md 04/08/2026). Les comptes par onglet viennent de " +
    "GET /admin/deals/compte, jamais de la longueur de cette liste.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      statut: z.string().optional().openapi({
        description: "auto_draft|en_attente|publie|rejete|expire — requis sauf si supprime=true",
      }),
      supprime: z
        .string()
        .optional()
        .openapi({ description: "true = onglet Supprimés (lot 1) — exclusif de statut, ignore ce paramètre" }),
      cursor: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: paginated(DealAdmin, "DealAdminPage") } } },
    400: errorResponse("Statut manquant ou inconnu, ou curseur invalide pour cet onglet"),
    403: errorResponse("Accès refusé (non-admin)"),
  },
  tags: ["admin"],
});

const CompteAdminDeals = registry.register(
  "CompteAdminDeals",
  z.object({
    comptes: z.object({
      auto_draft: z.number().int(),
      en_attente: z.number().int(),
      publie: z.number().int(),
      rejete: z.number().int(),
      expire: z.number().int(),
    }),
    supprimes: z.number().int().openapi({ description: "Lignes supprime_le is not null (lot 1)" }),
  })
);

registry.registerPath({
  method: "get",
  path: "/admin/deals/compte",
  summary: "Compte par statut (CONTRAT-V1 §4, neuvième amendement conscient)",
  description:
    "count(*) en base, groupé par statut — les cinq clés sont toujours présentes, à 0 s'il n'y a aucune " +
    "ligne. Jamais déduit de la longueur d'une liste paginée (docs/INCIDENTS.md, 04/08/2026). " +
    "`supprimes` (dixième amendement, lot 1) compte séparément les lignes supprime_le is not null.",
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: CompteAdminDeals } } },
    403: errorResponse("Accès refusé (non-admin)"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "patch",
  path: "/admin/deals/{publicId}",
  summary:
    "Édition curateur complète d'un deal + changement de statut (tracé dans journal_audit) — " +
    "CONTRAT-V1 §3/§4, troisième amendement conscient du 19/07/2026",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    body: { content: { "application/json": { schema: DealAdminUpdate } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: DealAdmin } } },
    400: errorResponse("Corps invalide (statut/champ métier incohérent, enseigneSlug inconnu...)"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
  },
  tags: ["admin"],
});

const SuppressionOk = registry.register("SuppressionOk", z.object({ ok: z.literal(true) }));

registry.registerPath({
  method: "delete",
  path: "/admin/deals/{publicId}",
  summary: "Suppression DOUCE d'un deal (CONTRAT-V1 §3, dixième amendement conscient, 05/08/2026)",
  description:
    "Pose supprime_le, ne supprime JAMAIS la ligne SQL — sans PITR, un DELETE réel serait irréversible " +
    "en pratique. `statut` n'est pas touché : POST .../restaurer renvoie le deal dans son statut d'origine.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: SuppressionOk } } },
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
    409: errorResponse("Ce deal est déjà supprimé"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/{publicId}/restaurer",
  summary: "Restaure un deal supprimé (CONTRAT-V1 §3, dixième amendement conscient, 05/08/2026)",
  description: "Efface supprime_le. Le deal revient dans son statut D'ORIGINE, jamais touché par la suppression.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: DealAdmin } } },
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
    409: errorResponse("Ce deal n'est pas supprimé"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/{publicId}/image-depuis-lien",
  summary:
    "Récupère l'image produit depuis le lien existant du deal (og:image, repli twitter:image/image_src) — " +
    "CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026. Garde SSRF stricte sur chaque fetch.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: { description: "OK — image_key mis à jour", content: { "application/json": { schema: DealAdmin } } },
    400: errorResponse("Deal sans lien, lien non autorisé (SSRF), page sans og:image, image invalide"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/{publicId}/image",
  summary:
    "Téléverse manuellement une image (jpeg/png/webp, 5 Mo max) — fallback à image-depuis-lien pour " +
    "les sources qui bloquent la récupération serveur (CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ image: z.string().openapi({ format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    200: { description: "OK — image_key mis à jour", content: { "application/json": { schema: DealAdmin } } },
    400: errorResponse("Fichier manquant, trop volumineux (>5 Mo) ou type non reconnu (jpeg/png/webp uniquement)"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/{publicId}/diffuser/telegram",
  summary:
    "Diffuse le deal sur le canal Telegram communautaire (curation manuelle, un deal à la fois) — " +
    "CONTRAT-V1 §4, amendement du 02/08/2026, mode explicite depuis le dix-septième amendement (08/08/2026). " +
    "La ligne `diffusions` n'est écrite qu'après un envoi réellement abouti.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    query: z.object({
      mode: z
        .enum(["production", "test"])
        .openapi({
          description:
            "REQUIS, aucune valeur par défaut. \"test\" sans TELEGRAM_CHAT_ID_TEST configurée : refus explicite, jamais un repli vers la production.",
        }),
    }),
  },
  responses: {
    200: {
      description: "OK — message publié",
      content: {
        "application/json": {
          schema: z.object({
            diffuse: z.literal(true),
            canal: z.literal("telegram"),
            messageId: z.number().int(),
            canalTest: z.boolean().openapi({
              description: "true si mode=test (l'envoi est parti vers TELEGRAM_CHAT_ID_TEST)",
            }),
          }),
        },
      },
    },
    400: errorResponse(
      "mode manquant/invalide, diffusion non configurée pour ce mode sur cet environnement, ou envoi refusé par Telegram"
    ),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
    409: errorResponse("Deal non publié, ou déjà diffusé sur ce canal"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "delete",
  path: "/admin/deals/{publicId}/diffuser/telegram",
  summary:
    "Annule la diffusion Telegram — supprime le message du canal (deleteMessage) puis la ligne `diffusions`. " +
    "Si Telegram refuse, la ligne reste : le message est toujours dans le canal.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: {
      description: "OK — message retiré et diffusion effacée",
      content: {
        "application/json": {
          schema: z.object({
            diffuse: z.literal(false),
            canal: z.literal("telegram"),
            messageSupprime: z.number().int(),
          }),
        },
      },
    },
    400: errorResponse("Diffusion non configurée, ou suppression refusée par Telegram (la diffusion reste enregistrée)"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable, ou aucune diffusion Telegram à annuler"),
    409: errorResponse("Diffusion enregistrée sans identifiant de message"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/deals/{publicId}/diffuser/discord",
  summary:
    "Diffuse le deal sur le canal Discord (webhook entrant, embed) — CONTRAT-V1 §4, amendement du 02/08/2026, " +
    "mode explicite depuis le dix-septième amendement (08/08/2026). " +
    "Webhook appelé avec ?wait=true : sans lui Discord répond 204 sans identifiant, et le message serait indélébile.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ publicId: z.string() }),
    query: z.object({
      mode: z
        .enum(["production", "test"])
        .openapi({
          description:
            "REQUIS, aucune valeur par défaut. \"test\" sans DISCORD_WEBHOOK_URL_TEST configurée : refus explicite, jamais un repli vers la production.",
        }),
    }),
  },
  responses: {
    200: {
      description: "OK — message publié",
      content: {
        "application/json": {
          schema: z.object({
            diffuse: z.literal(true),
            canal: z.literal("discord"),
            messageId: z.string().openapi({ description: "Snowflake Discord, transporté en chaîne" }),
            canalTest: z.boolean().openapi({
              description: "true si mode=test (l'envoi est parti vers DISCORD_WEBHOOK_URL_TEST)",
            }),
          }),
        },
      },
    },
    400: errorResponse(
      "mode manquant/invalide, diffusion non configurée pour ce mode sur cet environnement, ou envoi refusé par Discord"
    ),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable"),
    409: errorResponse("Deal non publié, ou déjà diffusé sur Discord"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "delete",
  path: "/admin/deals/{publicId}/diffuser/discord",
  summary:
    "Annule la diffusion Discord — supprime le message via /webhooks/{id}/{token}/messages/{message_id}, " +
    "puis la ligne `diffusions`. Si Discord refuse, la ligne reste : le message est toujours dans le canal.",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ publicId: z.string() }) },
  responses: {
    200: {
      description: "OK — message retiré et diffusion effacée",
      content: {
        "application/json": {
          schema: z.object({
            diffuse: z.literal(false),
            canal: z.literal("discord"),
            messageSupprime: z.string(),
          }),
        },
      },
    },
    400: errorResponse("Diffusion non configurée, ou suppression refusée par Discord (la diffusion reste enregistrée)"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Deal introuvable, ou aucune diffusion Discord à annuler"),
    409: errorResponse("Diffusion enregistrée sans identifiant de message"),
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
            statut: dealAdminUpdateSchema.shape.statut,
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

const MemoireCurationEntry = registry.register(
  "MemoireCurationEntry",
  z.object({
    id: z.string(),
    empreinte: z.string(),
    motif: z.string().nullable(),
    dealOriginePublicId: z.string().nullable(),
    decideLe: z.string().datetime(),
    deciderPseudo: z.string().nullable(),
    origineTitre: z.string().nullable().openapi({ description: "Titre actuel du deal d'origine, s'il existe encore" }),
    origineStatut: z.string().nullable().openapi({ description: "Statut actuel du deal d'origine, s'il existe encore" }),
  })
);

registry.registerPath({
  method: "get",
  path: "/admin/memoire-curation",
  summary: "Décisions de curation actives (onzième amendement conscient, lot 2, 05/08/2026)",
  description:
    "Liste les décisions 'rejete' non levées (levee_le is null), plus récentes d'abord — celles que " +
    "le pipeline consulte avant d'insérer un deal scrapé, via empreinte_curation(lien, titre, " +
    "enseigne_id) (jamais le prix). Jointure souple sur le deal d'origine (pas une FK) : renseigne " +
    "son état actuel quand il existe encore, pour décider s'il faut lever.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ limit: z.string().optional() }) },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ data: z.array(MemoireCurationEntry) }) } },
    },
    403: errorResponse("Accès refusé (non-admin)"),
  },
  tags: ["admin"],
});

registry.registerPath({
  method: "post",
  path: "/admin/memoire-curation/{id}/lever",
  summary: "Lève une décision de curation (onzième amendement conscient, lot 2, 05/08/2026)",
  description:
    "Répond à : un deal rejeté puis légitimement republié par l'enseigne, que devient-il ? Sans ce " +
    "geste la mémoire serait une liste noire définitive. Ne supprime rien (même principe que " +
    "deals.supprime_le) : pose levee_le/levee_par/levee_motif, l'entrée reste lisible, seul le " +
    "pipeline cesse de la consulter.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: z.object({ motif: z.string().optional() }) } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: z.object({ ok: z.literal(true), leveeLe: z.string().datetime() }) } },
    },
    400: errorResponse("Identifiant invalide"),
    403: errorResponse("Accès refusé (non-admin)"),
    404: errorResponse("Entrée introuvable"),
    409: errorResponse("Décision déjà levée"),
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
