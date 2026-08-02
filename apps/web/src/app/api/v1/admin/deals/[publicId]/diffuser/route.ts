import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { logAudit } from "../../../../_lib/audit.js";
import { publierDeal, TelegramError, TelegramConfigError } from "../../../../_lib/telegram.js";
import { buildLegendeTelegram, lienDiffusion } from "../../../../_lib/diffusionMessage.js";
import { SITE_URL } from "../../../../../../../lib/siteUrl.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

const CANAL = "telegram";

/**
 * POST /api/v1/admin/deals/:publicId/diffuser — requireAdmin.
 * Diffusion communautaire v1 (docs/IDEES.md) : curation MANUELLE, un deal à
 * la fois. Pas de diffusion en masse, pas de seuil automatique de votes —
 * au lancement, c'est la diffusion qui crée le volume de votes, pas
 * l'inverse.
 *
 * ORDRE DES OPÉRATIONS, ET C'EST LE CŒUR DE CETTE ROUTE :
 *   1. gardes (statut, non déjà diffusé) ;
 *   2. envoi Telegram ;
 *   3. INSERT dans `diffusions` UNIQUEMENT si l'envoi a réussi.
 *
 * L'inverse (écrire d'abord, envoyer ensuite) laisserait en base la trace
 * d'une diffusion qui n'a pas eu lieu, et le garde-fou anti-double-envoi
 * bloquerait alors le vrai envoi. Un échec Telegram remonte tel quel à
 * l'admin, avec la description renvoyée par l'API — jamais un « c'est
 * parti » de politesse.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const rows = await query<{
    id: string;
    titre: string;
    statut: string;
    prix_promo: string;
    prix_normal: string | null;
    image_key: string | null;
    enseigne_nom: string | null;
    deja_diffuse: boolean;
  }>(
    `select d.id, d.titre, d.statut, d.prix_promo, d.prix_normal, d.image_key,
            e.nom as enseigne_nom,
            exists (select 1 from diffusions df where df.deal_id = d.id and df.canal = $2) as deja_diffuse
       from deals d
       left join enseignes e on e.id = d.enseigne_id
      where d.public_id = $1`,
    [publicId, CANAL]
  );
  const deal = rows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");

  // Garde 1 — on ne diffuse que ce qui est public. Diffuser un auto_draft ou
  // un en_attente enverrait la communauté sur une page qui répond 404.
  if (deal.statut !== "publie") {
    return apiError("CONFLICT", `Seul un deal publié se diffuse (statut actuel : ${deal.statut}).`);
  }

  // Garde 2 — applicative, doublée en base par `unique (deal_id, canal)`
  // (migration 0011). Celle-ci donne un message clair ; c'est la contrainte
  // qui tient réellement en cas de double clic simultané.
  if (deal.deja_diffuse) {
    return apiError("CONFLICT", "Ce deal a déjà été diffusé sur Telegram.");
  }

  const prixPromo = Number(deal.prix_promo);
  const prixNormal = deal.prix_normal === null ? null : Number(deal.prix_normal);
  const lien = lienDiffusion(deal.titre, publicId, CANAL);
  const legende = buildLegendeTelegram({
    titre: deal.titre,
    prixPromo,
    prixNormal,
    enseigneNom: deal.enseigne_nom,
    lien,
  });

  // Telegram télécharge l'image lui-même : l'URL doit être publique et
  // absolue (route proxy /img/deals/[publicId], CONTRAT-V1 §6). Un deal sans
  // image part en message texte plutôt que de ne pas partir.
  const photoUrl = deal.image_key ? new URL(`/img/deals/${publicId}`, SITE_URL).toString() : null;

  let envoi: { messageId: number; test: boolean };
  try {
    envoi = await publierDeal({ legende, photoUrl });
  } catch (err) {
    if (err instanceof TelegramConfigError) {
      return apiError("VALIDATION_ERROR", "Diffusion Telegram non configurée sur cet environnement.");
    }
    if (err instanceof TelegramError) {
      // L'erreur réelle remonte : statut HTTP + description de Telegram.
      // C'est ce que l'admin doit lire pour savoir quoi faire (canal
      // introuvable, bot non admin du canal, image inaccessible…).
      console.error(
        JSON.stringify({
          evenement: "diffusion_telegram_echec",
          publicId,
          statut: err.statut,
          description: err.description,
        })
      );
      return apiError(
        "VALIDATION_ERROR",
        `Telegram a refusé l'envoi${err.statut ? ` (HTTP ${err.statut})` : ""}${
          err.description ? ` : ${err.description}` : "."
        }`
      );
    }
    throw err;
  }

  // Succès seulement : la ligne est écrite APRÈS l'envoi réel.
  await query(
    `insert into diffusions (deal_id, canal, telegram_message_id) values ($1, $2, $3)`,
    [deal.id, CANAL, envoi.messageId]
  );

  await logAudit({
    adminId: admin.id,
    action: "diffuser_telegram",
    cibleType: "deal",
    cibleId: publicId,
    details: { messageId: envoi.messageId, canalTest: envoi.test, avecPhoto: Boolean(photoUrl) },
  });

  return NextResponse.json({
    diffuse: true,
    canal: CANAL,
    messageId: envoi.messageId,
    /** Vrai si l'envoi est parti vers TELEGRAM_CHAT_ID_TEST — l'admin doit
     *  savoir qu'il vient de tester, pas de publier. */
    canalTest: envoi.test,
  });
});
