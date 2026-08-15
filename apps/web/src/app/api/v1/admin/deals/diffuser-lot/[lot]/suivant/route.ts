import { NextResponse } from "next/server";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../../_lib/errors.js";
import { suivantDuLot } from "../../../../../_lib/diffusionLots.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ lot: string }> };

/**
 * POST /api/v1/admin/deals/diffuser-lot/:lot/suivant — requireAdmin.
 * Traite UN deal du lot (le plus ancien encore `en_attente`) et renvoie le
 * résultat. L'appelant (client admin) attend le délai d'étalement configuré
 * avant de rappeler cette route pour le suivant — l'étalement est tenu CÔTÉ
 * CLIENT (dix-neuvième amendement conscient) : ce dépôt n'a ni file de
 * tâches ni WebSocket, et le délai demandé entre deux envois dépasserait le
 * temps d'exécution d'une fonction serverless pour un lot de taille réaliste.
 *
 * REPRISE SANS RENVOI : cette route ne retraite jamais un deal déjà
 * `envoye`/`deja_diffuse` — `suivantDuLot` choisit toujours le premier
 * `en_attente` restant, peu importe combien d'appels précédents ont réussi
 * ou combien de rechargements de page sont survenus entretemps.
 *
 * `{ termine: true }` signale la fin du lot — plus rien à traiter, le client
 * arrête sa boucle.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { lot } = await params;
  const resultat = await suivantDuLot(admin, lot);
  if (!resultat) return apiError("NOT_FOUND", "Lot introuvable.");
  return NextResponse.json(resultat);
});
