import {
  DiffusionConfigError,
  DiffusionRefusError,
  type CanalDiffusion,
  type DealADiffuser,
} from "./diffusionCanal.js";
import { buildLegendeTelegram } from "./diffusionMessage.js";

/**
 * Canal Telegram — API Bot officielle (docs/IDEES.md « Diffusion
 * communautaire », architecture tranchée : curation manuelle depuis l'admin).
 *
 * PAS DE DÉPENDANCE (ni telegraf, ni node-telegram-bot-api) : trois méthodes
 * HTTP (`sendPhoto`, `sendMessage`, `deleteMessage`) sur un endpoint documenté
 * et stable. Une bibliothèque complète apporterait un polling, un système de
 * commandes et une surface de mise à jour, pour zéro usage.
 *
 * PAS DE REPLI SILENCIEUX (docs/INCIDENTS.md) : aucune fonction ne renvoie
 * `null` ou `false` sur échec — elle lève, avec le statut HTTP et la
 * description renvoyés par Telegram.
 */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 15_000;

function lireJeton(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new DiffusionConfigError("TELEGRAM_BOT_TOKEN manquant.");
  return token;
}

/**
 * Destination du message.
 *
 * `TELEGRAM_CHAT_ID_TEST` PRIME sur `TELEGRAM_CHAT_ID` dès qu'elle est
 * définie, quel que soit l'environnement. Interrupteur par PRÉSENCE de
 * variable, jamais par `NODE_ENV`/`VERCEL_ENV` : un envoi qui part dans le
 * canal public est irrattrapable pour qui l'a vu passer, et une condition
 * d'environnement se trompe en silence (preview mal étiqueté, script lancé à
 * la main, build local pointant sur la prod). Une variable présente, elle, se
 * lit dans le dashboard.
 */
export function lireChatId(): { chatId: string; test: boolean } {
  const test = process.env.TELEGRAM_CHAT_ID_TEST;
  if (test) return { chatId: test, test: true };
  const prod = process.env.TELEGRAM_CHAT_ID;
  if (!prod) throw new DiffusionConfigError("TELEGRAM_CHAT_ID manquant.");
  return { chatId: prod, test: false };
}

async function appeler(methode: string, corps: Record<string, unknown>): Promise<unknown> {
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
    throw new DiffusionRefusError(
      `Appel Telegram ${methode} impossible : ${err instanceof Error ? err.message : "erreur réseau"}`,
      null,
      null
    );
  }

  let payload: { ok?: boolean; description?: string; result?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Corps illisible : le statut reste l'information utile.
  }

  if (!response.ok || payload.ok !== true) {
    throw new DiffusionRefusError(
      `Telegram a refusé ${methode} (HTTP ${response.status}).`,
      response.status,
      payload.description ?? null
    );
  }
  return payload.result;
}

export const canalTelegram: CanalDiffusion = {
  nom: "telegram",
  libelle: "Telegram",

  estConfigure() {
    return Boolean(
      process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID_TEST || process.env.TELEGRAM_CHAT_ID)
    );
  },

  /**
   * `photoUrl` absent → message texte : un deal sans image reste diffusable,
   * il ne se diffuse simplement pas en photo. Telegram télécharge lui-même
   * l'URL de la photo, qui doit donc être publiquement atteignable (route
   * proxy /img/deals/[publicId], CONTRAT-V1 §6).
   */
  async publier(deal: DealADiffuser) {
    const { chatId, test } = lireChatId();
    const legende = buildLegendeTelegram({
      titre: deal.titre,
      prixPromo: deal.prixPromo,
      prixNormal: deal.prixNormal,
      enseigneNom: deal.enseigneNom,
      lien: deal.lien,
    });

    const commun = { chat_id: chatId, parse_mode: "HTML", disable_web_page_preview: false };
    const result = deal.photoUrl
      ? await appeler("sendPhoto", { ...commun, photo: deal.photoUrl, caption: legende })
      : await appeler("sendMessage", { ...commun, text: legende });

    const messageId = (result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId !== "number") {
      // Sans identifiant, la diffusion serait indélébile. Échec franc.
      throw new DiffusionRefusError("Telegram a répondu sans message_id.", null, null);
    }
    return { messageId: String(messageId), test };
  },

  /**
   * `chat_id` relu de l'environnement plutôt que stocké par diffusion : on
   * supprime là où l'on publie AUJOURD'HUI. Si le canal a changé depuis
   * l'envoi, Telegram répond « message to delete not found » — un refus
   * lisible, jamais une suppression au mauvais endroit.
   *
   * Limites propres à Telegram : le bot doit être administrateur du canal, et
   * au-delà de 48 h la suppression peut être refusée. Ces refus remontent.
   */
  async supprimer(messageId: string) {
    const { chatId } = lireChatId();
    await appeler("deleteMessage", { chat_id: chatId, message_id: Number(messageId) });
  },
};
