import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { query, withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { DEAL_FROM } from "../../../_lib/deals.js";
import { lireFiltresAdmin, conditionsFiltresAdmin } from "../../../_lib/adminDealsFilters.js";
import { appliquerLotStatut } from "../../../_lib/adminDealsBulk.js";

export const runtime = "nodejs";

/**
 * POST /api/v1/admin/deals/bulk-filtre — requireAdmin. L'action s'exprime
 * comme FILTRE + VERBE, jamais une liste de public_id transmise par le
 * client (lot du 12/08/2026) : `statut` et les filtres (`enseigne`,
 * `categorie`, `remiseMin`/`Max`, `prixMin`/`Max`, `dateMin`/`Max`) sont
 * des PARAMÈTRES D'URL — exactement ceux déjà utilisés par `GET
 * /admin/deals` et `GET /admin/deals/compte-filtre` (SOURCE UNIQUE,
 * `conditionsFiltresAdmin`) : le résultat qui s'affiche EST le résultat
 * qui agit, aucune divergence possible entre ce que l'admin voit et ce
 * qui est modifié.
 *
 * `{ verbe, motifRejet }` dans le corps — le seul choix propre à
 * l'ÉCRITURE, pas à la lecture.
 *
 * Réservé aux DEUX onglets de modération initiale (`auto_draft`,
 * `en_attente`) — même périmètre que `bulk` (sélection manuelle) : élargir
 * un rejet de masse à `publie`/`rejete`/`expire` n'a pas été demandé, et
 * `ONGLET_ACTIONS` (AdminPipeline.tsx) n'expose ces verbes que sur ces deux
 * onglets.
 *
 * PLAFOND DE SÉCURITÉ (2000) : une action qui touche un nombre non borné
 * de lignes n'est jamais un simple clic — au-delà, l'appelant doit affiner
 * son filtre. Généreux au-delà de « plusieurs centaines » (le volume
 * réellement éprouvé pour ce lot), mais pas littéralement sans limite : un
 * filtre absent sur un onglet qui grossirait un jour à plusieurs dizaines
 * de milliers de lignes ne doit pas pouvoir tout rejeter d'un geste.
 */
const MAX_LOT = 2000;

const VERBES = new Set(["publie", "rejete"]);

const bulkFiltreSchema = z
  .object({
    verbe: z.enum(["publie", "rejete"]),
    motifRejet: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.verbe === "rejete" && !val.motifRejet) {
      ctx.addIssue({
        code: "custom",
        path: ["motifRejet"],
        message: "Un rejet doit être motivé : le soumetteur doit pouvoir comprendre pourquoi.",
      });
    }
  });

const ONGLETS_AUTORISES = new Set(["auto_draft", "en_attente"]);

export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const statutParsed = dealStatutSchema.safeParse(searchParams.get("statut"));
  if (!statutParsed.success) {
    return apiError("VALIDATION_ERROR", "Paramètre statut requis, parmi les statuts connus.");
  }
  const statut = statutParsed.data;
  if (!ONGLETS_AUTORISES.has(statut)) {
    return apiError("VALIDATION_ERROR", "Action groupée par filtre réservée aux onglets Pipeline et En attente.");
  }

  const parsed = await parseJsonBody(request, bulkFiltreSchema);
  if (!parsed.success) return parsed.response;
  const { verbe, motifRejet } = parsed.data;
  if (!VERBES.has(verbe)) {
    return apiError("VALIDATION_ERROR", "Verbe inconnu.");
  }

  const filtres = lireFiltresAdmin(searchParams);
  const values: unknown[] = [statut];
  const conditions = ["d.statut = $1", "d.supprime_le is null"];
  const { conditions: conditionsFiltres, values: valeursFiltres } = conditionsFiltresAdmin(filtres, values.length + 1);
  conditions.push(...conditionsFiltres);
  values.push(...valeursFiltres);

  // Résolution des id CÔTÉ SERVEUR — le client n'en a jamais transmis
  // aucun. Plafonnée à MAX_LOT : au-delà, refus explicite plutôt qu'une
  // action tronquée en silence (le nombre annoncé à la confirmation
  // — `GET /compte-filtre` — doit toujours être le nombre réellement
  // traité, jamais moins).
  values.push(MAX_LOT + 1);
  const limitIdx = values.length;
  const candidats = await query<{ public_id: string }>(
    `select d.public_id ${DEAL_FROM} where ${conditions.join(" and ")} order by d.public_id limit $${limitIdx}`,
    values
  );
  if (candidats.length > MAX_LOT) {
    return apiError(
      "VALIDATION_ERROR",
      `Ce filtre touche plus de ${MAX_LOT} lignes — affine-le avant de traiter le lot en une fois.`
    );
  }

  const lot = randomUUID();
  const publicIds = candidats.map((c) => c.public_id);
  const updated = await withTransaction((client) =>
    appliquerLotStatut({ client, admin, publicIds, statut: verbe, motifRejet, lot })
  );

  return NextResponse.json({ updated, lot, touched: updated.length });
});
