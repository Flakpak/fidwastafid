"use client";

import { useState } from "react";
import type { DealAdmin, DealStatut } from "@fidwastafid/schemas";
import { joinMeta } from "../../lib/format.js";

export interface TerrainFields {
  nomVendeur: string;
  adresse: string;
  lienMaps: string;
  whatsappContact: string;
  whatsappPublic: boolean;
}

function toTerrainFields(deal: DealAdmin): TerrainFields {
  return {
    nomVendeur: deal.nomVendeur ?? "",
    adresse: deal.adresse ?? "",
    lienMaps: deal.lienMaps ?? "",
    whatsappContact: deal.whatsappContact ?? "",
    whatsappPublic: deal.whatsappPublic,
  };
}

interface Action {
  label: string;
  statut: DealStatut;
  variant: "primaire" | "danger" | "neutre";
}

const ACTION_CLASSES: Record<Action["variant"], string> = {
  primaire: "bg-vert text-white",
  danger: "border border-rouge text-rouge",
  neutre: "border border-bordure text-muted",
};

function remise(deal: DealAdmin): number {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return 0;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/**
 * Ligne de deal du pipeline admin — extraite d'AdminPipeline (CONTRAT-V1 §3,
 * amendement du 18/07/2026) : le curateur peut enrichir les champs terrain
 * d'un deal (nomVendeur/adresse/lienMaps/whatsapp) sans passer par une
 * resoumission, et motiver un rejet. Panneau `<details>` natif (pas de state
 * d'ouverture supplémentaire) pour ne pas alourdir la liste par défaut.
 */
export function AdminDealItem({
  deal,
  actions,
  showCheckbox,
  checked,
  onToggle,
  pending,
  onAction,
  onSaveFields,
}: {
  deal: DealAdmin;
  actions: Action[];
  showCheckbox: boolean;
  checked: boolean;
  onToggle: () => void;
  pending: boolean;
  onAction: (statut: DealStatut, motifRejet?: string) => void | Promise<void>;
  onSaveFields: (fields: TerrainFields) => void | Promise<void>;
}) {
  const [fields, setFields] = useState<TerrainFields>(() => toTerrainFields(deal));
  const [motifRejet, setMotifRejet] = useState("");
  const [savingFields, setSavingFields] = useState(false);

  async function handleSaveFields() {
    setSavingFields(true);
    try {
      await onSaveFields(fields);
    } finally {
      setSavingFields(false);
    }
  }

  return (
    <li className="bg-white border border-bordure rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {showCheckbox && <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />}
        <div className="flex-1 flex flex-col gap-1">
          <span className="font-bold">{deal.titre}</span>
          <div className="text-xs text-muted">{joinMeta(deal.enseigneSlug ?? deal.nomVendeur, deal.ville, deal.categorie)}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-black text-rouge">{deal.prixPromo} DH</span>
            {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
            {remise(deal) > 0 && (
              <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{remise(deal)}%</span>
            )}
          </div>
          <div className="text-xs text-muted">Soumis par {deal.submitterPublicId ?? "collecte automatique"}</div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => void onAction(action.statut, action.statut === "rejete" ? motifRejet || undefined : undefined)}
              disabled={pending}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${ACTION_CLASSES[action.variant]}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <details className="border-t border-bordure pt-2">
        <summary className="text-xs font-bold text-muted cursor-pointer select-none">Détails terrain</summary>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-bold">
            Nom du commerce
            <input
              value={fields.nomVendeur}
              onChange={(e) => setFields((f) => ({ ...f, nomVendeur: e.target.value }))}
              maxLength={80}
              className="border border-bordure rounded px-2 py-1 font-normal text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            Adresse
            <input
              value={fields.adresse}
              onChange={(e) => setFields((f) => ({ ...f, adresse: e.target.value }))}
              maxLength={200}
              className="border border-bordure rounded px-2 py-1 font-normal text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            Lien Maps
            <input
              value={fields.lienMaps}
              onChange={(e) => setFields((f) => ({ ...f, lienMaps: e.target.value }))}
              className="border border-bordure rounded px-2 py-1 font-normal text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            WhatsApp
            <input
              value={fields.whatsappContact}
              onChange={(e) => setFields((f) => ({ ...f, whatsappContact: e.target.value }))}
              placeholder="0612345678 ou +212612345678"
              className="border border-bordure rounded px-2 py-1 font-normal text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={fields.whatsappPublic}
              onChange={(e) => setFields((f) => ({ ...f, whatsappPublic: e.target.checked }))}
            />
            Numéro affiché publiquement {fields.whatsappPublic ? "(consenti)" : "(admin uniquement)"}
          </label>
          <button
            type="button"
            onClick={() => void handleSaveFields()}
            disabled={savingFields || pending}
            className="self-start bg-bleu text-white rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            Enregistrer les champs
          </button>

          <label className="flex flex-col gap-1 text-xs font-bold mt-1">
            Motif (visible par le soumetteur, envoyé avec « Rejeter »)
            <textarea
              value={motifRejet}
              onChange={(e) => setMotifRejet(e.target.value)}
              rows={2}
              maxLength={500}
              className="border border-bordure rounded px-2 py-1 font-normal text-sm"
            />
          </label>
        </div>
      </details>
    </li>
  );
}
