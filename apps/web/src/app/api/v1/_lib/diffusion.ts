import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import type { AuthUser } from "@fidwastafid/auth";
import { apiError } from "./errors.js";
import { logAudit } from "./audit.js";
import { lienDiffusion } from "./diffusionMessage.js";
import { DiffusionConfigError, DiffusionRefusError, type CanalDiffusion } from "./diffusionCanal.js";
import { SITE_URL } from "../../../../lib/siteUrl.js";

/**
 * Orchestration commune à tous les canaux de diffusion.
 *
 * Écrit UNE fois ce qui ne doit pas diverger entre Telegram et Discord :
 * les gardes, l'ordre des opérations, et la règle de cohérence en cas de
 * refus de la plateforme. Deux copies de cette logique dériveraient — même
 * raison que la validation zod partagée du pipeline, ou que l'action
 * d'alerte mutualisée entre les deux workflows quotidiens.
 *
 * Ce qui reste propre à un canal (forme du message, API appelée) vit dans son
 * adaptateur (`telegram.ts`, `discord.ts`).
 */

interface DealRow {
  id: string;
  titre: string;
  statut: string;
  prix_promo: string;
  prix_normal: string | null;
  image_key: string | null;
  enseigne_nom: string | null;
  deja_diffuse: boolean;
}

/**
 * POST — publie un deal sur un canal.
 *
 * ORDRE NON NÉGOCIABLE :
 *   1. gardes (deal publié, pas déjà diffusé sur CE canal) ;
 *   2. envoi ;
 *   3. INSERT `diffusions` uniquement si l'envoi a abouti.
 *
 * L'inverse laisserait en base la trace d'une diffusion qui n'a pas eu lieu,
 * et l'anti-double-envoi bloquerait ensuite le vrai envoi.
 */
export async function diffuser(
  admin: AuthUser,
  publicId: string,
  canal: CanalDiffusion
): Promise<NextResponse> {
  const rows = await query<DealRow>(
    `select d.id, d.titre, d.statut, d.prix_promo, d.prix_normal, d.image_key,
            e.nom as enseigne_nom,
            exists (select 1 from diffusions df where df.deal_id = d.id and df.canal = $2) as deja_diffuse
       from deals d
       left join enseignes e on e.id = d.enseigne_id
      where d.public_id = $1`,
    [publicId, canal.nom]
  );
  const deal = rows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");

  // On ne diffuse que ce qui est public : un auto_draft ou un en_attente
  // enverrait la communauté sur une page qui répond 404.
  if (deal.statut !== "publie") {
    return apiError("CONFLICT", `Seul un deal publié se diffuse (statut actuel : ${deal.statut}).`);
  }
  // Garde applicative, doublée en base par `unique (deal_id, canal)`
  // (migration 0011) : celle-ci donne un message clair, la contrainte est ce
  // qui tient sous deux clics simultanés. Le verrou est PAR CANAL — diffuser
  // sur Discord un deal déjà sur Telegram reste légitime.
  if (deal.deja_diffuse) {
    return apiError("CONFLICT", `Ce deal a déjà été diffusé sur ${canal.libelle}.`);
  }

  const lien = lienDiffusion(deal.titre, publicId, canal.nom);
  // La plateforme télécharge l'image elle-même : l'URL doit être publique et
  // absolue (route proxy /img/deals/[publicId], CONTRAT-V1 §6). Un deal sans
  // image se diffuse quand même, sans image.
  const photoUrl = deal.image_key ? new URL(`/img/deals/${publicId}`, SITE_URL).toString() : null;

  let envoi: { messageId: string; test: boolean };
  try {
    envoi = await canal.publier({
      titre: deal.titre,
      prixPromo: Number(deal.prix_promo),
      prixNormal: deal.prix_normal === null ? null : Number(deal.prix_normal),
      enseigneNom: deal.enseigne_nom,
      photoUrl,
      lien,
    });
  } catch (err) {
    const echec = traiterEchec(err, canal, publicId, "diffusion");
    if (echec) return echec;
    throw err;
  }

  await query(`insert into diffusions (deal_id, canal, external_message_id) values ($1, $2, $3)`, [
    deal.id,
    canal.nom,
    envoi.messageId,
  ]);

  await logAudit({
    adminId: admin.id,
    action: `diffuser_${canal.nom}`,
    cibleType: "deal",
    cibleId: publicId,
    details: { messageId: envoi.messageId, canalTest: envoi.test, avecPhoto: Boolean(photoUrl) },
  });

  return NextResponse.json({
    diffuse: true,
    canal: canal.nom,
    messageId: envoi.messageId,
    /** Vrai si l'envoi est parti vers la destination de TEST du canal —
     *  le curateur doit savoir qu'il vient de tester, pas de publier. */
    canalTest: envoi.test,
  });
}

/**
 * DELETE — annule une diffusion.
 *
 * ORDRE MIROIR : suppression sur la plateforme D'ABORD, ligne ENSUITE. Si la
 * plateforme refuse (droits insuffisants, message trop ancien, déjà supprimé
 * à la main), la ligne RESTE : elle décrit la réalité, le message est
 * toujours là. L'effacer rendrait le deal rediffusable et produirait le
 * doublon que cette table existe pour empêcher.
 */
export async function annuler(
  admin: AuthUser,
  publicId: string,
  canal: CanalDiffusion
): Promise<NextResponse> {
  const rows = await query<{ diffusion_id: string | null; external_message_id: string | null }>(
    `select df.id as diffusion_id, df.external_message_id
       from deals d
       left join diffusions df on df.deal_id = d.id and df.canal = $2
      where d.public_id = $1`,
    [publicId, canal.nom]
  );
  const ligne = rows[0];
  if (!ligne) return apiError("NOT_FOUND", "Deal introuvable.");
  if (!ligne.diffusion_id) {
    return apiError("NOT_FOUND", `Ce deal n'a pas de diffusion ${canal.libelle} à annuler.`);
  }
  if (!ligne.external_message_id) {
    return apiError(
      "CONFLICT",
      "Diffusion enregistrée sans identifiant de message : suppression automatique impossible."
    );
  }

  try {
    await canal.supprimer(ligne.external_message_id);
  } catch (err) {
    const echec = traiterEchec(err, canal, publicId, "annulation");
    if (echec) return echec;
    throw err;
  }

  await query("delete from diffusions where id = $1", [ligne.diffusion_id]);

  await logAudit({
    adminId: admin.id,
    action: `annuler_diffusion_${canal.nom}`,
    cibleType: "deal",
    cibleId: publicId,
    details: { messageId: ligne.external_message_id },
  });

  return NextResponse.json({
    diffuse: false,
    canal: canal.nom,
    messageSupprime: ligne.external_message_id,
  });
}

/**
 * Traduit un échec de canal en réponse d'API. Renvoie `null` si l'erreur
 * n'est pas une erreur de diffusion — à l'appelant de la relancer plutôt que
 * de l'avaler (pas de repli silencieux).
 *
 * La description renvoyée par la plateforme est remontée telle quelle : c'est
 * ce que le curateur doit lire pour savoir quoi faire (« bot is not a member
 * of the channel », « Unknown Message »…). Jamais l'URL appelée, qui porte le
 * token du webhook Discord.
 */
function traiterEchec(
  err: unknown,
  canal: CanalDiffusion,
  publicId: string,
  operation: "diffusion" | "annulation"
): NextResponse | null {
  if (err instanceof DiffusionConfigError) {
    return apiError("VALIDATION_ERROR", `Diffusion ${canal.libelle} non configurée sur cet environnement.`);
  }
  if (err instanceof DiffusionRefusError) {
    console.error(
      JSON.stringify({
        evenement: `${operation}_${canal.nom}_echec`,
        publicId,
        statut: err.statut,
        description: err.description,
      })
    );
    const suffixe =
      operation === "annulation"
        ? " La diffusion reste enregistrée — le message est toujours dans le canal."
        : "";
    return apiError(
      "VALIDATION_ERROR",
      `${canal.libelle} a refusé ${operation === "annulation" ? "la suppression" : "l'envoi"}${
        err.statut ? ` (HTTP ${err.statut})` : ""
      }${err.description ? ` : ${err.description}` : "."}${suffixe}`
    );
  }
  return null;
}
