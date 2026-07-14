"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DealAdmin, DealStatut } from "@fidwastafid/schemas";
import { joinMeta } from "../../lib/format.js";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

function remise(deal: DealAdmin): number {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return 0;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/** auto_draft toujours en tête (CONTRAT-V1 §4), puis remise décroissante. */
function comparePipeline(a: DealAdmin, b: DealAdmin): number {
  const aAuto = a.statut === "auto_draft" ? 0 : 1;
  const bAuto = b.statut === "auto_draft" ? 0 : 1;
  if (aAuto !== bAuto) return aAuto - bAuto;
  return remise(b) - remise(a);
}

const STATUT_LABELS: Record<DealStatut, string> = {
  auto_draft: "Auto (brouillon)",
  en_attente: "En attente",
  publie: "Publié",
  rejete: "Rejeté",
  expire: "Expiré",
};

export function AdminPipeline() {
  const [deals, setDeals] = useState<DealAdmin[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fetchDeals = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/v1/admin/deals");
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.code === "UNAUTHENTICATED" || body.error?.code === "FORBIDDEN") {
        setError("Accès admin requis. Connecte-toi avec un compte administrateur.");
      } else {
        setError(body.error?.message ?? "Impossible de charger le pipeline.");
      }
      setDeals(null);
      return;
    }
    const body = (await res.json()) as { data: DealAdmin[] };
    setDeals(body.data);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial au montage, pattern standard (https://react.dev/reference/react/useEffect#fetching-data-with-effects), pas de state dérivable du render
    void fetchDeals();
  }, [fetchDeals]);

  const sorted = useMemo(() => (deals ? [...deals].sort(comparePipeline) : []), [deals]);

  function toggle(publicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }

  async function bulk(statut: "publie" | "rejete") {
    if (selected.size === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/deals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds: Array.from(selected), statut }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Action groupée impossible.");
        return;
      }
      await fetchDeals();
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return <p className="bg-white border border-bordure rounded-xl p-5 text-center text-rouge font-bold">{error}</p>;
  }

  if (!deals) {
    return <p className="text-center text-muted py-16">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void bulk("publie")}
          disabled={pending || selected.size === 0}
          className="bg-rouge text-white rounded-lg px-4 py-2 font-bold text-sm disabled:opacity-50"
        >
          Valider la sélection ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => void bulk("rejete")}
          disabled={pending || selected.size === 0}
          className="bg-white border border-bordure rounded-lg px-4 py-2 font-bold text-sm disabled:opacity-50"
        >
          Rejeter la sélection
        </button>
      </div>

      {sorted.length === 0 && <p className="text-center text-muted py-16">Rien dans le pipeline.</p>}

      <ul className="flex flex-col gap-2">
        {sorted.map((deal) => (
          <li
            key={deal.publicId}
            className="bg-white border border-bordure rounded-xl p-4 flex items-start gap-3"
          >
            <input
              type="checkbox"
              checked={selected.has(deal.publicId)}
              onChange={() => toggle(deal.publicId)}
              className="mt-1"
            />
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold">{deal.titre}</span>
                <span className="text-xs font-bold bg-creme border border-bordure rounded px-2 py-0.5">
                  {STATUT_LABELS[deal.statut]}
                </span>
              </div>
              <div className="text-xs text-muted">{joinMeta(deal.enseigneSlug, deal.ville, deal.categorie)}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-black text-rouge">{deal.prixPromo} DH</span>
                {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
                {remise(deal) > 0 && (
                  <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{remise(deal)}%</span>
                )}
              </div>
              {deal.whatsappContact && (
                <div className="text-xs text-muted">WhatsApp : {deal.whatsappContact}</div>
              )}
              <div className="text-xs text-muted">
                Soumis par {deal.submitterPublicId ?? "collecte automatique"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
