import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema, type DealStatut } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../_lib/errors.js";
import {
  DEAL_ADMIN_SELECT,
  DEAL_FROM,
  DEAL_DOUBLON_JOIN,
  DEAL_DOUBLON_SELECT,
  REMISE_EXPR,
  triPourStatut,
  toDealAdmin,
  toDoublon,
  type DealAdminRow,
  type DoublonColumns,
} from "../../_lib/deals.js";
import { decodeAdminCursor, encodeAdminCursor, type AdminDealsCursor, type TriAdmin } from "../../_lib/adminDealsCursor.js";
import { lireFiltresAdmin, signatureFiltresAdmin, conditionsFiltresAdmin } from "../../_lib/adminDealsFilters.js";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * GET /api/v1/admin/deals — requireAdmin. `statut` est OBLIGATOIRE (sauf
 * mode `supprime`, voir plus bas) : un onglet interroge SON statut, jamais
 * la table entière (neuvième amendement conscient de la liste fermée,
 * CONTRAT-V1 §4, 04/08/2026).
 *
 * Avant ce lot, l'endpoint chargeait tous statuts confondus (`LIMIT 1000`)
 * et le tri/filtre par onglet se faisait côté client sur ce tableau déjà
 * tronqué — une soumission `en_attente` récente pouvait rester hors de la
 * fenêtre du `LIMIT` (938 lignes à égalité de score, départagées par
 * `public_id`, arbitraire) et donc invisible, sans qu'aucun filtre ni
 * jointure ne l'exclue réellement (docs/INCIDENTS.md, 04/08/2026). Filtrer
 * par statut EN BASE rend ce mode de défaillance impossible : la file
 * `en_attente` n'interroge jamais que les lignes `en_attente`.
 *
 * Pagination par curseur (`_lib/adminDealsCursor.ts`), même mécanique que
 * le feed public (`deals/route.ts`) : jamais d'offset, jamais de `LIMIT`
 * global masquant silencieusement des lignes. Les compteurs par onglet
 * viennent de `GET /api/v1/admin/deals/compte` (`count(*)` en base), pas
 * de la longueur de cette liste — un onglet paginé ne peut pas se compter
 * lui-même sans mentir sur ce qu'il ne charge pas encore.
 *
 * `?supprime=true` (lot 1, suppression douce) — mode exclusif, ignore
 * `statut` : renvoie les lignes `supprime_le is not null`, tous statuts
 * d'origine confondus, plus récemment supprimées d'abord. C'est le SEUL
 * endroit du dépôt où une ligne supprimée redevient lisible — l'onglet
 * admin « Supprimés », pour voir et restaurer. Toute autre lecture (tabs
 * de statut, feed public, fiche, sitemap, etc.) exclut `supprime_le is not
 * null` sans exception.
 *
 * FILTRES ET TRI (lot du 12/08/2026) : `enseigne`, `categorie`, `remiseMin`/
 * `remiseMax`, `prixMin`/`prixMax`, `dateMin`/`dateMax` (`_lib/
 * adminDealsFilters.ts`), combinables en AND avec `statut`, EN BASE — même
 * discipline que le neuvième amendement ci-dessus, jamais côté client.
 * `tri` optionnel (`?tri=date_asc|date_desc|remise_asc|remise_desc|
 * prix_asc|prix_desc`) surcharge le défaut par onglet (`triPourStatut`) ;
 * une valeur absente ou hors de cette liste retombe sur le défaut, jamais
 * une erreur. La signature des filtres actifs vit DANS le curseur
 * (`AdminDealsCursor.filtres`) : un changement de filtre ou de tri invalide
 * tout curseur existant, appliqué par le serveur, jamais laissé à la
 * discipline du client d'appeler avec `cursor` absent.
 */
const TRIS_APPELANT = new Set<TriAdmin>(["date_asc", "date_desc", "remise_asc", "remise_desc", "prix_asc", "prix_desc"]);

function colonneTri(tri: TriAdmin): string {
  if (tri === "date_asc" || tri === "date_desc") return "d.created_at";
  if (tri === "remise_asc" || tri === "remise_desc") return REMISE_EXPR;
  if (tri === "prix_asc" || tri === "prix_desc") return "d.prix_promo";
  return "d.supprime_le";
}

export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const modeSupprime = searchParams.get("supprime") === "true";

  let statut: DealStatut | "supprime";
  if (modeSupprime) {
    statut = "supprime";
  } else {
    const statutParsed = dealStatutSchema.safeParse(searchParams.get("statut"));
    if (!statutParsed.success) {
      return apiError("VALIDATION_ERROR", "Paramètre statut requis, parmi les statuts connus.");
    }
    statut = statutParsed.data;
  }

  const triParam = searchParams.get("tri");
  const tri: TriAdmin = modeSupprime
    ? "supprime_desc"
    : triParam && TRIS_APPELANT.has(triParam as TriAdmin)
      ? (triParam as TriAdmin)
      : triPourStatut(statut);
  const direction = tri.endsWith("_asc") ? "asc" : "desc";
  const compare = direction === "asc" ? ">" : "<";
  const sortColumn = colonneTri(tri);

  const filtres = lireFiltresAdmin(searchParams);
  const filtresSignature = signatureFiltresAdmin(filtres);

  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const cursorParam = searchParams.get("cursor");
  let cursor: AdminDealsCursor | null = null;
  if (cursorParam) {
    cursor = decodeAdminCursor(cursorParam);
    // Un curseur d'un AUTRE onglet (statut, ou le mode Supprimés), d'un
    // autre tri, ou de FILTRES différents pointerait une position dans une
    // file qui n'est pas celle-ci — même garde que le feed public sur sa
    // signature de filtres.
    if (!cursor || cursor.statut !== statut || cursor.tri !== tri || cursor.filtres !== filtresSignature) {
      return apiError("VALIDATION_ERROR", "Curseur invalide pour cet onglet, ce tri ou ces filtres.");
    }
  }

  const values: unknown[] = [];
  const conditions: string[] = [];
  if (modeSupprime) {
    conditions.push("d.supprime_le is not null");
  } else {
    values.push(statut);
    conditions.push("d.statut = $1", "d.supprime_le is null");
  }

  const { conditions: conditionsFiltres, values: valeursFiltres } = conditionsFiltresAdmin(filtres, values.length + 1);
  conditions.push(...conditionsFiltres);
  values.push(...valeursFiltres);

  if (cursor) {
    const cast = tri === "date_asc" || tri === "date_desc" || tri === "supprime_desc" ? "::timestamptz" : "";
    const cursorValue = cast ? cursor.value : Number(cursor.value);
    values.push(cursorValue);
    const valueIdx = values.length;
    values.push(cursor.publicId);
    const publicIdIdx = values.length;
    // Tie-break sur public_id (jamais l'id interne — CONTRAT-V1 §1), même
    // sens que le tri principal : une file croissante se départage en
    // croissant, une file décroissante en décroissant.
    conditions.push(
      `(${sortColumn} ${compare} $${valueIdx}${cast} OR (${sortColumn} = $${valueIdx}${cast} AND d.public_id ${compare} $${publicIdIdx}))`
    );
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  // `tri_valeur` sélectionné explicitement uniquement pour `remise_*` —
  // nécessaire pour réencoder le curseur de la page suivante avec la même
  // expression que le ORDER BY/WHERE ci-dessus (comme `tendance_rang`,
  // feed public). Les autres tris portent sur une vraie colonne déjà
  // présente dans DEAL_ADMIN_SELECT (`created_at`/`prix_promo`/
  // `supprime_le`), aucun alias supplémentaire requis.
  const selectExtra = tri === "remise_asc" || tri === "remise_desc" ? `, ${sortColumn} as tri_valeur` : "";

  const rows = await query<DealAdminRow & DoublonColumns & { tri_valeur?: number }>(
    `select ${DEAL_ADMIN_SELECT}, ${DEAL_DOUBLON_SELECT}${selectExtra}
     ${DEAL_FROM}
     ${DEAL_DOUBLON_JOIN}
     where ${conditions.join(" and ")}
     order by ${sortColumn} ${direction}, d.public_id ${direction}
     limit $${limitIdx}`,
    values
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = pageRows[pageRows.length - 1];
  if (hasMore && last) {
    const value =
      tri === "date_asc" || tri === "date_desc"
        ? new Date(last.created_at).toISOString()
        : tri === "supprime_desc"
          ? new Date(last.supprime_le as string).toISOString()
          : tri === "prix_asc" || tri === "prix_desc"
            ? String(last.prix_promo)
            : String(last.tri_valeur);
    nextCursor = encodeAdminCursor({ statut, tri, filtres: filtresSignature, value, publicId: last.public_id });
  }

  const data = pageRows.map((row) => ({ ...toDealAdmin(row), doublon: toDoublon(row) }));

  return NextResponse.json({ data, nextCursor });
});
