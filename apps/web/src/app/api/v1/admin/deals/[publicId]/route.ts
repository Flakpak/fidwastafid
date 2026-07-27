import { NextResponse } from "next/server";
import { withTransaction, type PoolClient } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import {
  dealAdminUpdateSchema,
  dealCoherenceIssues,
  motifRejetManquant,
  type DealStatut,
  type DealType,
} from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../_lib/deals.js";
import { logAudit } from "../../../_lib/audit.js";
import { champsModifies, type ChampCompare, type SorteChamp } from "../../../_lib/auditDiff.js";

type Context = { params: Promise<{ publicId: string }> };

interface DealEditableRow {
  id: string;
  statut: string;
  titre: string;
  description: string | null;
  /** `numeric` — `pg` le renvoie en CHAÎNE pour ne pas tronquer sa précision. */
  prix_promo: string;
  prix_normal: string | null;
  categorie: string;
  type: string;
  ville: string | null;
  date_fin: string | null;
  lien: string | null;
  /** `bigint` — chaîne aussi, pour la même raison (le typer `number` était un
   *  mensonge : il masquait le faux diff `"3" -> 3` sur enseigneSlug). */
  enseigne_id: string | null;
  motif_rejet: string | null;
  nom_vendeur: string | null;
  adresse: string | null;
  lien_maps: string | null;
  whatsapp_contact: string | null;
  whatsapp_public: boolean;
}

/**
 * Résout `enseigneSlug` en `enseigne_id` — même requête que POST /api/v1/deals.
 * `null` = déliaison explicite ("aucune enseigne") ; `undefined` (champ
 * absent du corps) = inchangé, ne touche pas à `enseigne_id`.
 */
async function resolveEnseigneId(
  client: PoolClient,
  enseigneSlug: string | null | undefined
): Promise<{ ok: true; value: number | null | undefined } | { ok: false; message: string }> {
  if (enseigneSlug === undefined) return { ok: true, value: undefined };
  if (enseigneSlug === null) return { ok: true, value: null };

  const rows = await client.query<{ id: number }>("select id from enseignes where slug = $1", [enseigneSlug]);
  const id = rows.rows[0]?.id;
  if (id === undefined) return { ok: false, message: `enseigneSlug : enseigne "${enseigneSlug}" inconnue.` };
  return { ok: true, value: id };
}

/**
 * PATCH /api/v1/admin/deals/:publicId — requireAdmin. Changement de statut +
 * édition curateur complète du deal (CONTRAT-V1 §3/§4, troisième amendement
 * conscient du 19/07/2026 : titre, prix, catégorie, type, ville, lien,
 * enseigne — en plus des champs terrain déjà éditables). Tout tracé dans
 * journal_audit dans la même transaction (pas d'action admin sans sa trace).
 *
 * La cohérence physique/en_ligne (dealCoherenceIssues, mêmes règles que
 * dealInputSchema) se vérifie sur l'état RÉSULTANT de la fusion patch +
 * valeurs existantes — un PATCH qui ne change que `ville` sans toucher à
 * `type`/`lien` doit rester validé contre le type/lien actuels du deal, pas
 * contre des champs absents du corps de la requête.
 *
 * `coalesce` sur la plupart des champs — même pattern que PATCH /api/v1/me :
 * un champ omis du corps de la requête laisse la valeur existante intacte,
 * il n'y a pas de moyen de "l'effacer" via ce endpoint (limite acceptée),
 * SAUF `enseigneSlug` qui distingue explicitement omis de `null`.
 */
export const PATCH = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const parsed = await parseJsonBody(request, dealAdminUpdateSchema);
  if (!parsed.success) return parsed.response;
  const patch = parsed.data;

  const result = await withTransaction(async (client) => {
    const before = await client.query<DealEditableRow>(
      `select id, statut, titre, description, prix_promo, prix_normal, categorie, type, ville,
              date_fin, lien, enseigne_id, motif_rejet, nom_vendeur, adresse, lien_maps,
              whatsapp_contact, whatsapp_public
       from deals where public_id = $1 for update`,
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal) return { kind: "not_found" as const };

    const enseigne = await resolveEnseigneId(client, patch.enseigneSlug);
    if (!enseigne.ok) {
      return { kind: "invalid" as const, message: enseigne.message, fields: { enseigneSlug: enseigne.message } };
    }

    // État résultant de la fusion patch + existant — seule base valide pour
    // la cohérence physique/en_ligne (cf. commentaire de fonction ci-dessus).
    const mergedLien: string | undefined = patch.lien !== undefined ? patch.lien : deal.lien !== null ? deal.lien : undefined;
    const merged: { type: DealType; lien?: string; prixPromo: number; prixNormal?: number } = {
      type: (patch.type ?? deal.type) as DealType,
      lien: mergedLien,
      prixPromo: patch.prixPromo ?? Number(deal.prix_promo),
      prixNormal:
        patch.prixNormal !== undefined ? patch.prixNormal : deal.prix_normal === null ? undefined : Number(deal.prix_normal),
    };
    const issues = dealCoherenceIssues(merged);
    if (issues.length > 0) {
      const fields: Record<string, string> = {};
      for (const issue of issues) {
        const path = issue.path.join(".");
        if (!(path in fields)) fields[path] = issue.message;
      }
      return { kind: "invalid" as const, message: issues.map((i) => i.message).join(" | "), fields };
    }

    // Motif de rejet obligatoire — vérifié sur l'état RÉSULTANT, comme la
    // cohérence ci-dessus : rejeter exige un motif, mais éditer un deal déjà
    // rejeté et déjà motivé n'a pas à le renvoyer (CONTRAT-V1 §3,
    // motifRejetManquant dans packages/schemas). La garantie est ici, côté
    // serveur : le formulaire la double, il ne la remplace pas.
    const motifResultant = patch.motifRejet ?? deal.motif_rejet;
    if (motifRejetManquant(patch.statut as DealStatut, motifResultant)) {
      const message = "Un rejet doit être motivé : le soumetteur doit pouvoir comprendre pourquoi.";
      return { kind: "invalid" as const, message, fields: { motifRejet: message } };
    }

    await client.query(
      `update deals set
         statut = $1,
         motif_rejet = coalesce($2, motif_rejet),
         nom_vendeur = coalesce($3, nom_vendeur),
         adresse = coalesce($4, adresse),
         lien_maps = coalesce($5, lien_maps),
         whatsapp_contact = coalesce($6, whatsapp_contact),
         whatsapp_public = coalesce($7, whatsapp_public),
         titre = coalesce($8, titre),
         description = coalesce($9, description),
         prix_promo = coalesce($10, prix_promo),
         prix_normal = coalesce($11, prix_normal),
         categorie = coalesce($12, categorie),
         type = coalesce($13, type),
         ville = coalesce($14, ville),
         date_fin = coalesce($15, date_fin),
         lien = coalesce($16, lien),
         enseigne_id = case when $17 then $18 else enseigne_id end,
         updated_at = now()
       where id = $19`,
      [
        patch.statut,
        patch.motifRejet ?? null,
        patch.nomVendeur ?? null,
        patch.adresse ?? null,
        patch.lienMaps ?? null,
        patch.whatsappContact ?? null,
        patch.whatsappPublic ?? null,
        patch.titre ?? null,
        patch.description ?? null,
        patch.prixPromo ?? null,
        patch.prixNormal ?? null,
        patch.categorie ?? null,
        patch.type ?? null,
        patch.ville ?? null,
        patch.dateFin ?? null,
        patch.lien ?? null,
        patch.enseigneSlug !== undefined,
        enseigne.value ?? null,
        deal.id,
      ]
    );

    // Diff pour le journal d'audit — candidats : les champs présents dans le
    // corps de la requête (les autres n'ont pas bougé, coalesce oblige). Le
    // filtrage final ne garde que ceux dont la valeur a RÉELLEMENT changé, et
    // normalise les deux côtés avant comparaison : `pg` renvoie numeric et
    // bigint en chaîne alors que le corps JSON porte des nombres (cf.
    // _lib/auditDiff.ts, fait générateur du 27/07/2026).
    const FIELD_DB_MAP: Record<string, { colonne: keyof DealEditableRow; sorte: SorteChamp }> = {
      titre: { colonne: "titre", sorte: "texte" },
      description: { colonne: "description", sorte: "texte" },
      prixPromo: { colonne: "prix_promo", sorte: "nombre" },
      prixNormal: { colonne: "prix_normal", sorte: "nombre" },
      categorie: { colonne: "categorie", sorte: "texte" },
      type: { colonne: "type", sorte: "texte" },
      ville: { colonne: "ville", sorte: "texte" },
      dateFin: { colonne: "date_fin", sorte: "texte" },
      lien: { colonne: "lien", sorte: "texte" },
      nomVendeur: { colonne: "nom_vendeur", sorte: "texte" },
      adresse: { colonne: "adresse", sorte: "texte" },
      lienMaps: { colonne: "lien_maps", sorte: "texte" },
      whatsappContact: { colonne: "whatsapp_contact", sorte: "texte" },
      whatsappPublic: { colonne: "whatsapp_public", sorte: "booleen" },
      motifRejet: { colonne: "motif_rejet", sorte: "texte" },
    };
    const candidats: Record<string, ChampCompare> = {};
    for (const [key, { colonne, sorte }] of Object.entries(FIELD_DB_MAP)) {
      const newValue = (patch as Record<string, unknown>)[key];
      if (newValue !== undefined) candidats[key] = { avant: deal[colonne], apres: newValue, sorte };
    }
    if (patch.enseigneSlug !== undefined) {
      candidats.enseigneSlug = { avant: deal.enseigne_id, apres: enseigne.value ?? null, sorte: "nombre" };
    }
    const champs = champsModifies(candidats);

    await logAudit(
      {
        adminId: admin.id,
        action: "update_deal",
        cibleType: "deal",
        cibleId: publicId,
        details: { statut: { avant: deal.statut, apres: patch.statut }, champs },
      },
      client
    );

    const updated = await client.query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [
      deal.id,
    ]);
    return { kind: "ok" as const, row: updated.rows[0] };
  });

  if (result.kind === "not_found") return apiError("NOT_FOUND", "Deal introuvable.");
  if (result.kind === "invalid") return apiError("VALIDATION_ERROR", result.message, result.fields);
  if (!result.row) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDealAdmin(result.row));
});
