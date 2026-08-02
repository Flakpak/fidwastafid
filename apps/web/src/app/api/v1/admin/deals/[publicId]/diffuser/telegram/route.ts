import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../../../../_lib/errors.js";
import { diffuser, annuler } from "../../../../../_lib/diffusion.js";
import { canalTelegram } from "../../../../../_lib/telegram.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

/**
 * POST /api/v1/admin/deals/:publicId/diffuser/telegram — publie le deal sur
 * Telegram. DELETE annule cette diffusion (retire le message, puis la ligne).
 *
 * Route volontairement MINCE : gardes, ordre des opérations et traduction des
 * échecs vivent dans _lib/diffusion.ts, communs à tous les canaux. Ce fichier
 * ne fait que nommer le canal — c'est ce qui garantit que Telegram et
 * Telegram ne divergeront pas sur les règles qui comptent.
 *
 * Le chemin porte le canal explicitement (refactor du 02/08/2026, l'ancien
 * /diffuser implicite valait pour Telegram seul) : deux canaux se diffusent
 * indépendamment, s'annulent indépendamment, et l'anti-double-envoi est
 * lui-même par canal (unique deal_id, canal).
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;
  return diffuser(admin, publicId, canalTelegram);
});

export const DELETE = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;
  return annuler(admin, publicId, canalTelegram);
});
