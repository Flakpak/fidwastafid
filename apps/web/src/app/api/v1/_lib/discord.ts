import {
  DiffusionConfigError,
  DiffusionRefusError,
  type CanalDiffusion,
  type DealADiffuser,
} from "./diffusionCanal.js";

/**
 * Canal Discord — webhook entrant (docs/IDEES.md : « Discord : automatisé
 * (webhook entrant, embed image/prix/lien) »). Pas de bot, pas d'OAuth : une
 * URL unique porte à la fois la cible et l'authentification.
 *
 * `?wait=true` EST OBLIGATOIRE, ce n'est pas un réglage de confort. Sans lui,
 * Discord répond `204 No Content` : le message part, mais on n'apprend jamais
 * son identifiant — donc on ne peut plus le supprimer. Ce serait reproduire
 * exactement le défaut corrigé côté Telegram le 02/08 (une diffusion
 * indélébile), en le sachant.
 */

const TIMEOUT_MS = 15_000;

/** Couleur de l'embed : `accent` de la charte Tadelakt (#2F6B57, CONTRAT-V1
 *  §8), en entier — Discord n'accepte pas la notation hexadécimale texte. */
const COULEUR_ACCENT = 0x2f6b57;

/**
 * Découpe l'URL de webhook en (id, token) — nécessaires pour ÉDITER ou
 * SUPPRIMER un message, opérations qui ne passent pas par l'URL de webhook
 * telle quelle mais par `/webhooks/{id}/{token}/messages/{message_id}`.
 *
 * L'URL entière est un secret (elle authentifie à elle seule) : jamais
 * journalisée, jamais renvoyée dans une réponse d'API. Seul le fait qu'elle
 * soit absente ou malformée est rapporté.
 */
export function decouperWebhook(url: string): { id: string; token: string; base: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DiffusionConfigError("DISCORD_WEBHOOK_URL n'est pas une URL valide.");
  }
  // .../api/webhooks/{id}/{token}
  const m = parsed.pathname.match(/\/webhooks\/(\d+)\/([^/]+)\/?$/);
  const id = m?.[1];
  const token = m?.[2];
  if (!id || !token) {
    throw new DiffusionConfigError("DISCORD_WEBHOOK_URL ne ressemble pas à une URL de webhook Discord.");
  }
  return { id, token, base: parsed.origin };
}

function lireWebhook(): { id: string; token: string; base: string; test: boolean } {
  // Même doctrine que Telegram : une variable de test PRIME par sa seule
  // présence, jamais un test sur NODE_ENV.
  const test = process.env.DISCORD_WEBHOOK_URL_TEST;
  const url = test || process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new DiffusionConfigError("DISCORD_WEBHOOK_URL manquant.");
  return { ...decouperWebhook(url), test: Boolean(test) };
}

/** Construit l'embed. Fonction pure — testée sans réseau. */
export function buildEmbedDiscord(deal: DealADiffuser): Record<string, unknown> {
  const pct =
    deal.prixNormal && deal.prixNormal > deal.prixPromo
      ? Math.round((1 - deal.prixPromo / deal.prixNormal) * 100)
      : null;

  // Jamais de remise devinée (CONTRAT-V1) : sans prix barré exploitable, on
  // n'affiche qu'un prix, pas un pourcentage inventé.
  const prix =
    deal.prixNormal && deal.prixNormal > deal.prixPromo
      ? `**${deal.prixPromo} DH**  ~~${deal.prixNormal} DH~~${pct !== null ? `  −${pct}%` : ""}`
      : `**${deal.prixPromo} DH**`;

  const embed: Record<string, unknown> = {
    title: deal.titre.slice(0, 256), // limite Discord
    url: deal.lien,
    description: prix,
    color: COULEUR_ACCENT,
  };
  if (deal.enseigneNom) embed.author = { name: deal.enseigneNom };
  if (deal.photoUrl) embed.image = { url: deal.photoUrl };
  return embed;
}

async function appeler(url: string, init: RequestInit, operation: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new DiffusionRefusError(
      `Appel Discord ${operation} impossible : ${err instanceof Error ? err.message : "erreur réseau"}`,
      null,
      null
    );
  }
  if (!response.ok) {
    // Le corps d'erreur Discord porte un `message` lisible ; il ne contient
    // jamais le token, contrairement à l'URL — d'où le fait qu'on remonte le
    // corps mais jamais l'URL appelée.
    let description: string | null = null;
    try {
      const body = (await response.json()) as { message?: string };
      description = body.message ?? null;
    } catch {
      // Corps illisible : le statut suffit.
    }
    throw new DiffusionRefusError(
      `Discord a refusé ${operation} (HTTP ${response.status}).`,
      response.status,
      description
    );
  }
  return response;
}

export const canalDiscord: CanalDiffusion = {
  nom: "discord",
  libelle: "Discord",

  estConfigure() {
    return Boolean(process.env.DISCORD_WEBHOOK_URL_TEST || process.env.DISCORD_WEBHOOK_URL);
  },

  async publier(deal: DealADiffuser) {
    const { id, token, base, test } = lireWebhook();
    // `wait=true` : sans lui, 204 sans corps — et un message qu'on ne peut
    // plus retirer (voir l'en-tête de ce fichier).
    const response = await appeler(
      `${base}/api/webhooks/${id}/${token}?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [buildEmbedDiscord(deal)] }),
      },
      "l'envoi"
    );

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    if (typeof body.id !== "string" || body.id.length === 0) {
      throw new DiffusionRefusError("Discord a répondu sans identifiant de message.", null, null);
    }
    // Renvoyé en chaîne tel quel : un snowflake Discord dépasse la précision
    // entière de JavaScript, le convertir en nombre le corromprait.
    return { messageId: body.id, test };
  },

  async supprimer(messageId: string) {
    const { id, token, base } = lireWebhook();
    await appeler(
      `${base}/api/webhooks/${id}/${token}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
      "la suppression"
    );
  },
};
