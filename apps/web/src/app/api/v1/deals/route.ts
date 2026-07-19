import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { dealInputSchema, generatePublicId } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../_lib/errors.js";
import { parseJsonBody } from "../_lib/validation.js";
import { isRateLimited, getClientIp } from "../_lib/rateLimit.js";
import { verifyTurnstile } from "../_lib/turnstile.js";
import { decodeCursor, encodeCursor, type TriDeals } from "../_lib/pagination.js";
import { DEAL_SELECT, DEAL_FROM, PUBLIC_STATUTS, toDeal, type DealRow } from "../_lib/deals.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Rang de gravité (Phase 5, style Dealabs/Hacker News) — tri par défaut de
 * cet endpoint. Calculé dans le ORDER BY, jamais stocké : `score` et
 * `created_at` restent la seule source de vérité, ce rang n'est qu'une
 * projection éphémère de ces deux valeurs à l'instant de la requête.
 *
 * `created_at` comme référence temporelle : la table `deals` n'a pas de
 * colonne "date de publication" dédiée. `updated_at` a été écarté — il est
 * réécrit à chaque vote (`recalculateScore`) et à chaque édition curateur
 * des champs terrain (PATCH admin), donc un deal voté ou juste retouché par
 * un admin paraîtrait artificiellement neuf. `created_at` (soumission/
 * insertion pipeline) est la seule date fiable disponible ; limite acceptée :
 * un deal resté longtemps en `en_attente` avant validation cumule ce délai
 * dans son "âge" de gravité (pas de vraie date de publication à isoler).
 *
 * G = 1.3 (retenu dans la fourchette 1.2–1.5 suggérée, testé contre les
 * données locales) : plus doux que le G≈1.8 classique de Hacker News, choisi
 * car nos scores restent à un chiffre à ce stade (petite communauté) — un G
 * plus élevé écraserait tout score modeste presque immédiatement. À G=1.3,
 * un deal à score égal perd son avantage de fraîcheur face à un nouvel
 * arrivant en ~24-48h (rang divisé par ~28 à 24h, ~66 à 48h), la fenêtre
 * d'exposition naturelle visée avant que le score réel ne doive prendre le
 * relais.
 *
 * Référence temporelle en paramètre lié (`$N::timestamptz`), jamais un
 * `now()` littéral : `now()` recalculé à chaque requête ferait dériver le
 * rang de la ligne charnière entre deux pages de la même session de
 * pagination, au point de la faire réapparaître en double (cf.
 * DealsCursor.asOf, packages _lib/pagination.ts, pour le détail).
 */
function tendanceExpr(asOfParamIdx: number): string {
  return `((d.score + 1) / power((extract(epoch from ($${asOfParamIdx}::timestamptz - d.created_at)) / 3600.0) + 2, 1.3))`;
}

/**
 * GET /api/v1/deals — public, sans auth (CONTRAT-V1 §4).
 * Filtres : statut (restreint aux valeurs publiques, `publie` par défaut —
 * en_attente/rejete/auto_draft ne sortent jamais de cet endpoint non
 * authentifié, c'est le rôle de /api/v1/admin/deals), enseigne, ville,
 * categorie, type. Pagination par curseur (jamais offset), tri
 * tendance (défaut) | score | recent.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const statutParam = searchParams.get("statut");
  const statut = statutParam && PUBLIC_STATUTS.has(statutParam) ? statutParam : "publie";

  const triParam = searchParams.get("tri");
  const tri: TriDeals = triParam === "score" || triParam === "recent" ? triParam : "tendance";

  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const cursorParam = searchParams.get("cursor");
  let cursor = null;
  if (cursorParam) {
    cursor = decodeCursor(cursorParam);
    if (!cursor || cursor.tri !== tri) {
      return apiError("VALIDATION_ERROR", "Curseur invalide pour ce tri.");
    }
  }

  const conditions: string[] = ["d.statut = $1"];
  const values: unknown[] = [statut];

  const pushCondition = (column: string, value: string | null) => {
    if (!value) return;
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };
  pushCondition("e.slug", searchParams.get("enseigne"));
  pushCondition("d.ville", searchParams.get("ville"));
  pushCondition("d.categorie", searchParams.get("categorie"));
  pushCondition("d.type", searchParams.get("type"));

  // Figé à la première page (pas de curseur) puis reconduit tel quel par le
  // curseur pour chaque page suivante — jamais recalculé en cours de
  // pagination (cf. tendanceExpr ci-dessus).
  const asOf = tri === "tendance" ? (cursor?.asOf ?? new Date().toISOString()) : null;

  let sortColumn: string;
  if (tri === "score") {
    sortColumn = "d.score";
  } else if (tri === "recent") {
    sortColumn = "d.created_at";
  } else {
    values.push(asOf);
    sortColumn = tendanceExpr(values.length);
  }

  if (cursor) {
    // `tendance_rang` est un `numeric` Postgres (extract()/power() dessus
    // restent numeric, jamais double precision) — node-postgres le renvoie
    // donc en chaîne pour ne pas tronquer sa précision. Le convertir en
    // number JS ici referait exactement cette troncature à l'aller-retour
    // (perdue au-delà d'~17 chiffres significatifs) : pour deux deals de
    // rang strictement égal (score et âge identiques), l'égalité de
    // repli `${sortColumn} = $N` cesserait de matcher au bit près et les
    // exclurait tous les deux de la page suivante (trou observé en test).
    // On passe donc la chaîne telle quelle, castée en ::numeric côté SQL.
    const cursorValue = tri === "score" ? Number(cursor.value) : cursor.value;
    values.push(cursorValue);
    const valueIdx = values.length;
    values.push(cursor.publicId);
    const publicIdIdx = values.length;
    const cast = tri === "tendance" ? "::numeric" : "";
    // Tie-break sur public_id (jamais l'id interne — CONTRAT-V1 §1).
    conditions.push(
      `(${sortColumn} < $${valueIdx}${cast} OR (${sortColumn} = $${valueIdx}${cast} AND d.public_id < $${publicIdIdx}))`
    );
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  // `tendance_rang` sélectionné explicitement (alias) uniquement pour ce
  // tri — nécessaire pour réencoder le curseur de la page suivante avec la
  // même expression que le ORDER BY/WHERE ci-dessus.
  const selectExtra = tri === "tendance" ? `, ${sortColumn} as tendance_rang` : "";

  const rows = await query<DealRow & { tendance_rang?: string }>(
    `select ${DEAL_SELECT}${selectExtra}
     ${DEAL_FROM}
     where ${conditions.join(" and ")}
     order by ${sortColumn} desc, d.public_id desc
     limit $${limitIdx}`,
    values
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = pageRows[pageRows.length - 1];
  if (hasMore && last) {
    const value =
      tri === "score" ? String(last.score) : tri === "recent" ? new Date(last.created_at).toISOString() : String(last.tendance_rang);
    nextCursor = encodeCursor({ tri, value, publicId: last.public_id, asOf: asOf ?? undefined });
  }

  return NextResponse.json({ data: pageRows.map(toDeal), nextCursor });
}

/**
 * POST /api/v1/deals — soumission communautaire, authentifiée (requireUser).
 * Toujours créé en `en_attente` (CONTRAT-V1 §4 : "la machine collecte,
 * l'humain publie" — la validation admin est un acte séparé, PATCH
 * /api/v1/admin/deals/:publicId).
 */
export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const user = await requireUser(request);

  if (await isRateLimited("soumission", request, user.id)) {
    return apiError("RATE_LIMITED", "Trop de soumissions, réessaie plus tard.");
  }

  // Turnstile sur la soumission (plan v2, Phase 3) — token dans un header
  // dédié, pas dans le body : dealInputSchema est le modèle de domaine figé
  // (CONTRAT-V1 §3), pas l'endroit pour un artefact anti-abus.
  const turnstileOk = await verifyTurnstile(request.headers.get("x-turnstile-token"), getClientIp(request));
  if (!turnstileOk) {
    return apiError("VALIDATION_ERROR", "Vérification anti-robot invalide.");
  }

  const parsed = await parseJsonBody(request, dealInputSchema);
  if (!parsed.success) return parsed.response;
  const input = parsed.data;

  let enseigneId: number | null = null;
  if (input.enseigneSlug) {
    const enseigneRows = await query<{ id: number }>("select id from enseignes where slug = $1", [
      input.enseigneSlug,
    ]);
    if (!enseigneRows[0]) {
      return apiError("VALIDATION_ERROR", `enseigneSlug: enseigne "${input.enseigneSlug}" inconnue.`);
    }
    enseigneId = enseigneRows[0].id;
  }

  const publicId = generatePublicId();

  // image_key toujours null ici : dealInputSchema n'accepte plus imageKey
  // (CONTRAT-V1 §6) — la soumission publique ne peut pas fixer sa propre
  // clé d'image. Seul le pipeline écrit cette colonne, directement en
  // base, hors de cet endpoint.
  await query(
    `insert into deals
       (public_id, titre, enseigne_id, nom_vendeur, adresse, lien_maps, ville, categorie, type,
        prix_promo, prix_normal, date_fin, description, lien, image_key,
        whatsapp_contact, whatsapp_public, statut, submitter_id, score)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null,$15,$16,'en_attente',$17,0)`,
    [
      publicId,
      input.titre,
      enseigneId,
      input.nomVendeur ?? null,
      input.adresse ?? null,
      input.lienMaps ?? null,
      input.ville ?? null,
      input.categorie,
      input.type,
      input.prixPromo,
      input.prixNormal ?? null,
      input.dateFin ?? null,
      input.description ?? null,
      input.lien ?? null,
      input.whatsappContact ?? null,
      input.whatsappPublic,
      user.id,
    ]
  );

  // Relecture jointe (enseigne/submitter) plutôt qu'un RETURNING simple,
  // pour repasser par le même toDeal() que le reste de l'API.
  const rows = await query<DealRow>(`select ${DEAL_SELECT} ${DEAL_FROM} where d.public_id = $1`, [publicId]);
  const created = rows[0];
  if (!created) throw new Error("Deal introuvable juste après insertion — ne devrait pas arriver.");

  return NextResponse.json(toDeal(created), { status: 201 });
});
