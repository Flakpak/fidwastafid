"use client";

import { useState } from "react";
import type { DealAdmin } from "@fidwastafid/schemas";
import { joinMeta } from "../../lib/format.js";
import { STATUT_LABEL } from "./AdminDealItem.js";

export type RestaurationResult = { ok: true } | { ok: false; message: string };

/**
 * Ligne de l'onglet « Supprimés » (lot 1, suppression douce) — volontairement
 * SIMPLE et séparée d'AdminDealItem : rien à éditer, rien à diffuser, un
 * deal supprimé n'a qu'une seule action possible, le restaurer.
 *
 * `deal.statut` n'est jamais touché par la suppression (DELETE
 * /api/v1/admin/deals/:publicId ne pose que `supprime_le`) : la restauration
 * renvoie donc le deal dans son statut D'ORIGINE, affiché ici pour que
 * l'admin sache dans quel onglet il va réapparaître.
 */
export function AdminDealSupprime({
  deal,
  pending,
  checked,
  onToggle,
  onRestaurer,
}: {
  deal: DealAdmin;
  pending: boolean;
  /** Case à cocher pour la restauration groupée (lot du 15/08/2026, « tout
   *  sélectionner ») — toujours affichée ici, contrairement à
   *  `AdminDealItem` où elle dépend de l'onglet : cette liste n'affiche
   *  jamais que des deals supprimés, une seule action de masse est possible. */
  checked: boolean;
  onToggle: () => void;
  onRestaurer: () => Promise<RestaurationResult>;
}) {
  const [etat, setEtat] = useState<"idle" | "pending">("idle");
  const [erreur, setErreur] = useState<string | null>(null);

  async function restaurer() {
    setEtat("pending");
    setErreur(null);
    const r = await onRestaurer();
    setEtat("idle");
    if (!r.ok) setErreur(r.message);
  }

  return (
    <li className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-accent flex-shrink-0" />
      {/* `opacity-60` : cette photo n'est plus servie par le proxy public
          (lookup.ts exclut supprime_le is not null) — elle ne s'affiche
          donc que tant que le cache navigateur/CDN la garde. Pas un bug :
          la ligne est en cours de suppression, pas encore d'image dédiée
          à ce statut. */}
      {deal.imageKey && (
        <img
          src={`/img/deals/${deal.publicId}`}
          alt=""
          className="w-14 h-14 object-cover rounded-lg border border-border flex-shrink-0 opacity-60"
        />
      )}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span className="font-bold truncate">{deal.titre}</span>
        <div className="text-xs text-ink-muted">
          {joinMeta(deal.enseigneSlug ?? deal.nomVendeur, deal.ville, deal.categorie)}
        </div>
        <div className="text-xs text-ink-subtle">
          Supprimé le {deal.supprimeLe ? new Date(deal.supprimeLe).toLocaleString("fr-FR") : "date inconnue"} —
          reviendra en « {STATUT_LABEL[deal.statut]} »
        </div>
        {erreur && <p className="text-warn text-xs font-bold">{erreur}</p>}
      </div>
      <button
        type="button"
        onClick={() => void restaurer()}
        disabled={pending || etat === "pending"}
        className="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border border-accent-line bg-surface text-accent hover:bg-accent-soft disabled:opacity-50 flex-shrink-0 transition-colors duration-[130ms] motion-reduce:transition-none"
      >
        {etat === "pending" ? "Restauration..." : "Restaurer"}
      </button>
    </li>
  );
}
