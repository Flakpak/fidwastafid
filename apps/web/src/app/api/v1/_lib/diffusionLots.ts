import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@fidwastafid/db";
import type { AuthUser } from "@fidwastafid/auth";
import { diffuser } from "./diffusion.js";
import { canalTelegram } from "./telegram.js";
import { canalDiscord } from "./discord.js";
import type { CanalDiffusion, ModeDiffusion } from "./diffusionCanal.js";

/**
 * Diffusion en masse — CONTRAT-V1 §4, dix-neuvième amendement conscient
 * (migration 0021). RÉUTILISE `diffuser()` (_lib/diffusion.ts) deal par
 * deal, ne duplique jamais ses gardes ni son ordre envoi→écriture : ce
 * fichier orchestre un LOT de ces appels, il n'en réinvente aucun.
 *
 * POURQUOI PAS UN JOB SERVEUR EN ARRIÈRE-PLAN : l'étalement demandé entre
 * deux envois (throttle) dépasserait le délai d'exécution d'une fonction
 * serverless pour un lot de taille réaliste, et ce dépôt n'a ni file de
 * tâches ni WebSocket. Le rythme est donc tenu CÔTÉ CLIENT (l'admin garde
 * l'onglet ouvert, chaque appel à `/suivant` attend le délai configuré avant
 * le suivant) — `diffusion_lot_deals` est ce qui rend ce choix sûr : l'état
 * persiste en base, pas seulement en mémoire du navigateur, donc un
 * rechargement de page ne perd rien et ne renvoie rien de déjà réussi.
 */

const CANAUX: Record<string, CanalDiffusion> = { telegram: canalTelegram, discord: canalDiscord };

export function canalDepuisNom(nom: string): CanalDiffusion | null {
  return CANAUX[nom] ?? null;
}

export type StatutLotDeal = "en_attente" | "deja_diffuse" | "envoye" | "echoue";

export interface LotDealStatut {
  publicId: string;
  statut: StatutLotDeal;
  messageId: string | null;
  erreur: string | null;
  statutHttp: number | null;
}

export interface LotResume {
  lot: string;
  canal: string;
  mode: ModeDiffusion;
  creeLe: string;
  deals: LotDealStatut[];
}

/**
 * Crée le lot et fige immédiatement sa liste cible. Un `public_id` inconnu
 * est ignoré silencieusement (même convention que `bulk/route.ts`) — `total`
 * reflète ce qui a réellement été retenu, jamais la longueur de la demande.
 *
 * `deja_diffuse` posé ICI, avant tout appel réseau : un deal déjà diffusé en
 * PRODUCTION sur ce canal n'est jamais mis en file d'attente — c'est la
 * moitié « reprise sans renvoi » qui évite l'appel réseau superflu, pas
 * seulement la garde `unique (deal_id, canal)` côté `diffuser()` qui, elle,
 * ne fait qu'empêcher l'écriture après coup. Ne s'applique jamais en mode
 * test (une diffusion de test reste légitime même si le deal est déjà
 * diffusé réellement — comportement inchangé de `diffuser()`).
 */
export async function creerLot(
  admin: AuthUser,
  publicIds: string[],
  canalNom: string,
  mode: ModeDiffusion
): Promise<{ lot: string; total: number; dejaDiffuses: number }> {
  const rows = await query<{ id: string; public_id: string; deja_diffuse: boolean }>(
    `select d.id, d.public_id,
            exists (
              select 1 from diffusions df
               where df.deal_id = d.id and df.canal = $2 and df.mode = 'production'
            ) as deja_diffuse
       from deals d
      where d.public_id = any($1::text[])`,
    [publicIds, canalNom]
  );

  const lot = randomUUID();
  let dejaDiffuses = 0;

  await withTransaction(async (client) => {
    await client.query(`insert into diffusion_lots (id, canal, mode, admin_id) values ($1, $2, $3, $4)`, [
      lot,
      canalNom,
      mode,
      admin.id,
    ]);
    for (const r of rows) {
      const statut: StatutLotDeal = mode === "production" && r.deja_diffuse ? "deja_diffuse" : "en_attente";
      if (statut === "deja_diffuse") dejaDiffuses++;
      await client.query(
        `insert into diffusion_lot_deals (lot, deal_id, public_id, statut, traite_le)
         values ($1, $2, $3, $4, case when $4 = 'en_attente' then null else now() end)`,
        [lot, r.id, r.public_id, statut]
      );
    }
  });

  return { lot, total: rows.length, dejaDiffuses };
}

export async function fetchLot(lot: string): Promise<LotResume | null> {
  const lotRows = await query<{ canal: string; mode: ModeDiffusion; cree_le: string }>(
    `select canal, mode, cree_le from diffusion_lots where id = $1`,
    [lot]
  );
  const lotRow = lotRows[0];
  if (!lotRow) return null;

  const deals = await query<{
    public_id: string;
    statut: StatutLotDeal;
    message_id: string | null;
    erreur: string | null;
    statut_http: number | null;
  }>(
    `select public_id, statut, message_id, erreur, statut_http
       from diffusion_lot_deals
      where lot = $1
      order by public_id`,
    [lot]
  );

  return {
    lot,
    canal: lotRow.canal,
    mode: lotRow.mode,
    creeLe: new Date(lotRow.cree_le).toISOString(),
    deals: deals.map((d) => ({
      publicId: d.public_id,
      statut: d.statut,
      messageId: d.message_id,
      erreur: d.erreur,
      statutHttp: d.statut_http,
    })),
  };
}

export type SuivantResultat =
  | { termine: true }
  | { termine: false; publicId: string; statut: "envoye"; messageId: string | null }
  | { termine: false; publicId: string; statut: "echoue"; erreur: string; statutHttp: number | null; limiteDebit: boolean };

/**
 * Traite UN deal du lot (le plus ancien encore 'en_attente') et persiste le
 * résultat avant de le renvoyer — l'appelant (route HTTP) attend le délai
 * d'étalement configuré côté client avant de rappeler cette fonction pour le
 * suivant. `null` = lot introuvable (géré par la route appelante).
 *
 * `limiteDebit` détecté sur le TEXTE du message d'erreur (« HTTP 429 »,
 * cf. traiterEchec() dans diffusion.ts) — pas une donnée structurée : ni
 * Telegram ni Discord n'exposent aujourd'hui `Retry-After` jusqu'ici via
 * DiffusionRefusError (seuls `statut` et `description` y voyagent). Détecter
 * le 429 permet au moins au client d'arrêter la boucle plutôt que de
 * marteler une plateforme qui vient de refuser pour cette raison — voir le
 * rapport de cette PR pour la limite exacte de cette détection.
 */
export async function suivantDuLot(admin: AuthUser, lot: string): Promise<SuivantResultat | null> {
  const lotRows = await query<{ canal: string; mode: ModeDiffusion }>(
    `select canal, mode from diffusion_lots where id = $1`,
    [lot]
  );
  const lotRow = lotRows[0];
  if (!lotRow) return null;

  const canal = canalDepuisNom(lotRow.canal);
  if (!canal) {
    // Ne devrait jamais arriver (canal validé à la création du lot) — garde
    // défensive plutôt qu'un crash silencieux si la donnée en base divergeait.
    throw new Error(`Canal "${lotRow.canal}" inconnu pour le lot ${lot}.`);
  }

  const suivants = await query<{ public_id: string }>(
    `select public_id from diffusion_lot_deals where lot = $1 and statut = 'en_attente' order by public_id limit 1`,
    [lot]
  );
  const suivant = suivants[0];
  if (!suivant) return { termine: true };

  const reponse = await diffuser(admin, suivant.public_id, canal, lotRow.mode);
  const corps = (await reponse.json()) as { messageId?: string; error?: { message?: string } };

  if (reponse.status === 200) {
    await query(
      `update diffusion_lot_deals set statut = 'envoye', message_id = $3, traite_le = now()
        where lot = $1 and public_id = $2`,
      [lot, suivant.public_id, corps.messageId ?? null]
    );
    return { termine: false, publicId: suivant.public_id, statut: "envoye", messageId: corps.messageId ?? null };
  }

  const erreur = corps.error?.message ?? `Échec non détaillé (HTTP ${reponse.status}).`;
  await query(
    `update diffusion_lot_deals set statut = 'echoue', erreur = $3, statut_http = $4, traite_le = now()
      where lot = $1 and public_id = $2`,
    [lot, suivant.public_id, erreur, reponse.status]
  );
  return {
    termine: false,
    publicId: suivant.public_id,
    statut: "echoue",
    erreur,
    statutHttp: reponse.status,
    limiteDebit: /\bHTTP 429\b/.test(erreur),
  };
}

/**
 * Remet en file les deals 'echoue' du lot — jamais 'envoye' ni
 * 'deja_diffuse' : c'est précisément ce qui garantit qu'un nouvel appel à
 * `/suivant` après relance ne renvoie rien de déjà réussi.
 */
export async function relancerEchecsDuLot(lot: string): Promise<number> {
  const rows = await query(
    `update diffusion_lot_deals
        set statut = 'en_attente', erreur = null, statut_http = null, traite_le = null
      where lot = $1 and statut = 'echoue'
      returning public_id`,
    [lot]
  );
  return rows.length;
}
