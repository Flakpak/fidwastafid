import { NextResponse } from "next/server";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema } from "@fidwastafid/schemas";
import { withAuthErrors, apiError } from "../../../../../_lib/errors.js";
import { logAudit } from "../../../../../_lib/audit.js";
import { fetchEntreesLot } from "../../../../../_lib/adminDealsLots.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ lot: string }> };

/**
 * POST /api/v1/admin/deals/lots/:lot/annuler — requireAdmin. Défait un lot
 * d'action groupée (`bulk`/`bulk-filtre`, lot du 12/08/2026) : chaque deal
 * touché revient à son statut D'AVANT, tel qu'enregistré dans
 * `journal_audit` au moment du lot — jamais deviné.
 *
 * GARDE PAR DEAL — `statut = $apres` dans le WHERE : un deal dont le
 * statut a changé DEPUIS le lot (édition manuelle, un autre lot, une
 * expiration automatique) n'est PAS écrasé. La confirmation du lot
 * décrivait l'état d'AVANT le lot, pas l'état d'aujourd'hui — annuler
 * doit défaire CE lot précisément, jamais une décision plus récente prise
 * entre-temps. Un deal sauté à ce titre est compté à part, jamais confondu
 * avec un échec.
 *
 * `annuler_lot` — action NOUVELLE, volontairement absente de la liste
 * fermée non-probante de `deals_protection` (migration 0015) : un deal
 * annulé bascule donc en repli protecteur (doute -> protégé), jamais
 * l'inverse — cohérent avec la doctrine déjà gravée pour cette vue.
 *
 * LIMITE ASSUMÉE, pas un oubli : la mémoire de curation (lot 2) posée par
 * une transition vers `rejete` n'est PAS levée automatiquement ici — elle
 * a son propre geste explicite (`POST .../memoire-curation/:id/lever`).
 * Annuler un lot rend le deal de nouveau publiable à la main ; ça ne
 * rouvre pas pour autant la porte à une RÉINSERTION automatique du même
 * produit par le pipeline, qui resterait bloquée tant que la mémoire n'est
 * pas levée séparément — deux systèmes, deux gestes, par choix.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { lot } = await params;

  const entrees = await fetchEntreesLot(lot);
  if (entrees.length === 0) {
    return apiError("NOT_FOUND", "Lot introuvable — aucune entrée ne porte cet identifiant.");
  }

  const revertes: string[] = [];
  const sautes: string[] = [];

  await withTransaction(async (client) => {
    for (const entree of entrees) {
      const avantParsed = dealStatutSchema.safeParse(entree.avant);
      if (!avantParsed.success) {
        // Ligne d'audit antérieure à un statut aujourd'hui hors enum —
        // ne devrait pas arriver (statut toujours validé à l'écriture),
        // mais ne jamais écrire une valeur non reconnue en base.
        sautes.push(entree.cibleId);
        continue;
      }
      const result = await client.query<{ id: string }>(
        "update deals set statut = $1, updated_at = now() where public_id = $2 and statut = $3 and supprime_le is null returning id",
        [avantParsed.data, entree.cibleId, entree.apres]
      );
      if (result.rows.length !== 1) {
        sautes.push(entree.cibleId);
        continue;
      }

      await logAudit(
        {
          adminId: admin.id,
          action: "annuler_lot",
          cibleType: "deal",
          cibleId: entree.cibleId,
          details: { lotAnnule: lot, avant: entree.apres, apres: avantParsed.data },
        },
        client
      );
      revertes.push(entree.cibleId);
    }
  });

  return NextResponse.json({ lot, revertes: revertes.length, sautes: sautes.length });
});
