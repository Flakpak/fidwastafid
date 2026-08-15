import { NextResponse } from "next/server";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../../_lib/errors.js";
import { fetchLot, relancerEchecsDuLot } from "../../../../../_lib/diffusionLots.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ lot: string }> };

/**
 * POST /api/v1/admin/deals/diffuser-lot/:lot/relancer — requireAdmin. Remet
 * en file les deals `echoue` du lot (jamais `envoye` ni `deja_diffuse`) —
 * geste explicite après un échec en cours de lot (limite de débit, panne
 * momentanée d'un canal), le client reprend ensuite ses appels à `/suivant`.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  await requireAdmin(request);
  const { lot } = await params;
  const existant = await fetchLot(lot);
  if (!existant) return apiError("NOT_FOUND", "Lot introuvable.");
  const relances = await relancerEchecsDuLot(lot);
  return NextResponse.json({ lot, relances });
});
