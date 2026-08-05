import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../_lib/errors.js";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

interface MemoireRow {
  id: string;
  empreinte: string;
  motif: string | null;
  deal_origine_public_id: string | null;
  decide_le: string;
  decide_par_pseudo: string | null;
  origine_titre: string | null;
  origine_statut: string | null;
}

/**
 * GET /api/v1/admin/memoire-curation — requireAdmin. Onzième amendement
 * conscient de la liste fermée (CONTRAT-V1 §4, lot 2 « mémoire de
 * curation »). Liste les décisions ACTIVES (`levee_le is null`) — celles
 * qui bloquent encore une réinsertion pipeline — les plus récentes
 * d'abord.
 *
 * Jointure `left join deals` sur `deal_origine_public_id` (référence
 * SOUPLE, pas une FK, migration 0014) : renseigne l'état actuel du deal
 * d'origine QUAND il existe encore, pour que l'admin sache si un produit
 * bloqué mérite d'être levé (ex. l'enseigne l'a légitimement republié à
 * prix différent).
 *
 * Pas de pagination par curseur ici (limite plate, 200 lignes max) :
 * volume borné par construction — une entrée par rejet, jamais par le
 * pipeline lui-même — contrairement à `deals`, jamais alimentée en continu
 * à haut débit.
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const rows = await query<MemoireRow>(
    `select mc.id::text as id, mc.empreinte, mc.motif, mc.deal_origine_public_id,
            mc.decide_le, u.pseudo as decide_par_pseudo,
            d.titre as origine_titre, d.statut as origine_statut
       from memoire_curation mc
       left join users u on u.id = mc.decide_par
       left join deals d on d.public_id = mc.deal_origine_public_id
      where mc.decision = 'rejete' and mc.levee_le is null
      order by mc.decide_le desc
      limit $1`,
    [limit]
  );

  const data = rows.map((r) => ({
    id: r.id,
    empreinte: r.empreinte,
    motif: r.motif,
    dealOriginePublicId: r.deal_origine_public_id,
    decideLe: new Date(r.decide_le).toISOString(),
    deciderPseudo: r.decide_par_pseudo,
    origineTitre: r.origine_titre,
    origineStatut: r.origine_statut,
  }));

  return NextResponse.json({ data });
});
