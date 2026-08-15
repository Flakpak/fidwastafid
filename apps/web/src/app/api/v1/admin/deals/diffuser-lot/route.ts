import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@fidwastafid/auth";
import { publicIdSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { lireModeDiffusion } from "../../../_lib/diffusion.js";
import { canalDepuisNom, creerLot } from "../../../_lib/diffusionLots.js";

export const runtime = "nodejs";

/**
 * POST /api/v1/admin/deals/diffuser-lot?canal=telegram|discord&mode=production|test
 * — requireAdmin (CONTRAT-V1 §4, dix-neuvième amendement conscient,
 * migration 0021).
 *
 * `publicIds` transmis par le client (sélection MANUELLE depuis l'onglet
 * Publiés) — contrairement à `bulk-filtre` (§4, neuvième amendement), la
 * diffusion reste un geste de curation sur des deals PRÉCIS choisis un par
 * un, pas un filtre appliqué en masse : aucun filtre "diffuser tout ce qui
 * matche X" n'a été demandé, et la liste des candidats est figée ICI, à la
 * création du lot — un rechargement de page qui changerait le résultat d'un
 * filtre ne doit jamais changer ce qu'un lot déjà lancé va traiter.
 *
 * `?mode=` REQUIS, même contrat que `/diffuser/:canal` (dix-septième
 * amendement) — jamais de repli entre test et production.
 */
const CANAUX = new Set(["telegram", "discord"]);

const creerLotSchema = z.object({
  publicIds: z.array(publicIdSchema).min(1).max(300),
});

export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const canalNom = searchParams.get("canal");
  if (!canalNom || !CANAUX.has(canalNom)) {
    return apiError("VALIDATION_ERROR", `Paramètre canal requis, "telegram" ou "discord" (reçu : ${canalNom ?? "absent"}).`);
  }
  if (!canalDepuisNom(canalNom)) {
    return apiError("VALIDATION_ERROR", `Canal "${canalNom}" inconnu.`);
  }

  const mode = lireModeDiffusion(request);
  if (mode instanceof NextResponse) return mode;

  const parsed = await parseJsonBody(request, creerLotSchema);
  if (!parsed.success) return parsed.response;

  const { lot, total, dejaDiffuses } = await creerLot(admin, parsed.data.publicIds, canalNom, mode);
  if (total === 0) {
    return apiError("VALIDATION_ERROR", "Aucun des deals demandés n'existe.");
  }

  return NextResponse.json({ lot, canal: canalNom, mode, total, dejaDiffuses, aTraiter: total - dejaDiffuses });
});
