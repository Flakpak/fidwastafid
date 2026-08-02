/**
 * Client minimal de l'API Bot Telegram — diffusion communautaire v1
 * (docs/IDEES.md « Diffusion communautaire », architecture déjà tranchée :
 * curation manuelle depuis l'admin, jamais de seuil automatique).
 *
 * PAS DE DÉPENDANCE (ni telegraf, ni node-telegram-bot-api) : on appelle
 * deux méthodes HTTP (`sendPhoto`, `sendMessage`) sur un endpoint documenté
 * et stable. Une bibliothèque complète apporterait ici un polling, un
 * système de commandes et une surface de mise à jour, pour zéro usage.
 *
 * PAS DE REPLI SILENCIEUX (docs/INCIDENTS.md, motif des 19/07, 24/07 et
 * 02/08) : aucune fonction de ce module ne renvoie `null` ou `false` sur
 * échec. Elle lève `TelegramError` avec le statut HTTP et la description
 * renvoyée par Telegram. L'appelant doit pouvoir dire à l'admin *pourquoi*
 * ça n'est pas parti — et surtout, ne PAS écrire en base une diffusion qui
 * n'a pas eu lieu.
 */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 15_000;

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly statut: number | null,
    readonly description: string | null
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

/** Configuration absente (variable d'environnement non posée). Distinct de
 *  TelegramError : ce n'est pas Telegram qui refuse, c'est nous qui n'avons
 *  rien à lui envoyer. Les deux ne se traitent pas pareil côté appelant. */
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramConfigError";
  }
}

function lireJeton(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfigError("TELEGRAM_BOT_TOKEN manquant.");
  return token;
}

/**
 * Destination du message.
 *
 * `TELEGRAM_CHAT_ID_TEST` PRIME sur `TELEGRAM_CHAT_ID` dès qu'elle est
 * définie, quel que soit l'environnement. C'est volontairement un
 * interrupteur par PRÉSENCE de variable et non par `NODE_ENV`/`VERCEL_ENV` :
 * un test qui part dans le canal public est irrattrapable (on ne « dé-poste »
 * pas devant des abonnés), et une condition d'environnement se trompe
 * silencieusement — un preview mal étiqueté, un script lancé à la main, un
 * build local pointant sur la prod. Une variable présente, elle, se lit
 * dans le dashboard.
 *
 * Corollaire assumé : poser `TELEGRAM_CHAT_ID_TEST` en production
 * détournerait toutes les diffusions vers le canal de test. C'est le sens
 * voulu — on préfère un envoi qui n'atteint personne à un envoi qui atteint
 * tout le monde par erreur.
 */
export function lireChatId(): { chatId: string; test: boolean } {
  const test = process.env.TELEGRAM_CHAT_ID_TEST;
  if (test) return { chatId: test, test: true };
  const prod = process.env.TELEGRAM_CHAT_ID;
  if (!prod) throw new TelegramConfigError("TELEGRAM_CHAT_ID manquant.");
  return { chatId: prod, test: false };
}

/** Vrai si la diffusion est configurée — sert à l'UI admin pour ne pas
 *  proposer un bouton qui ne peut mener qu'à une erreur. */
export function diffusionConfiguree(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID_TEST || process.env.TELEGRAM_CHAT_ID));
}

async function appeler(methode: string, corps: Record<string, unknown>): Promise<{ message_id: number }> {
  const token = lireJeton();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/bot${token}/${methode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Réseau/timeout : jamais confondu avec un refus de Telegram (statut null).
    throw new TelegramError(
      `Appel Telegram ${methode} impossible : ${err instanceof Error ? err.message : "erreur réseau"}`,
      null,
      null
    );
  }

  let payload: { ok?: boolean; description?: string; result?: { message_id?: number } } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Corps illisible : on garde le statut, qui reste l'information utile.
  }

  if (!response.ok || payload.ok !== true) {
    throw new TelegramError(
      `Telegram a refusé ${methode} (HTTP ${response.status}).`,
      response.status,
      payload.description ?? null
    );
  }

  const messageId = payload.result?.message_id;
  if (typeof messageId !== "number") {
    // Telegram dit ok mais ne renvoie pas d'identifiant : on ne peut pas
    // tracer la diffusion. Échec franc plutôt qu'une ligne à message_id null
    // qu'on prendrait plus tard pour un envoi Discord.
    throw new TelegramError(`Telegram a répondu sans message_id sur ${methode}.`, response.status, null);
  }
  return { message_id: messageId };
}

/**
 * Publie un deal. `photoUrl` absent → message texte : un deal sans image
 * reste diffusable, il ne se diffuse simplement pas en photo. Telegram
 * télécharge lui-même l'URL de la photo, qui doit donc être publiquement
 * atteignable (route proxy /img/deals/[publicId], CONTRAT-V1 §6).
 */
export async function publierDeal(params: {
  legende: string;
  photoUrl: string | null;
}): Promise<{ messageId: number; chatId: string; test: boolean }> {
  const { chatId, test } = lireChatId();

  const commun = { chat_id: chatId, parse_mode: "HTML", disable_web_page_preview: false };
  const resultat = params.photoUrl
    ? await appeler("sendPhoto", { ...commun, photo: params.photoUrl, caption: params.legende })
    : await appeler("sendMessage", { ...commun, text: params.legende });

  return { messageId: resultat.message_id, chatId, test };
}
