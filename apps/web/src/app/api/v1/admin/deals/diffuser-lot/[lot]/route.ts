import { NextResponse } from "next/server";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { fetchLot } from "../../../../_lib/diffusionLots.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ lot: string }> };

/**
 * GET /api/v1/admin/deals/diffuser-lot/:lot — requireAdmin. État complet
 * d'un lot de diffusion (dix-neuvième amendement conscient) : un par un,
 * pour la barre de progression et pour reconstruire l'écran après un
 * rechargement de page — l'état vit en base (`diffusion_lot_deals`), jamais
 * seulement en mémoire côté client.
 */
export const GET = withAuthErrors<Context>(async (request, { params }) => {
  await requireAdmin(request);
  const { lot } = await params;
  const resume = await fetchLot(lot);
  if (!resume) return apiError("NOT_FOUND", "Lot introuvable.");
  return NextResponse.json(resume);
});
