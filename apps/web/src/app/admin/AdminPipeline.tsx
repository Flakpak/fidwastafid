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

function compareRemise(a: DealAdmin, b: DealAdmin): number {
  return remise(b) - remise(a);
}

const ONGLETS: DealStatut[] = ["auto_draft", "en_attente", "publie", "rejete", "expire"];

const ONGLET_LABELS: Record<DealStatut, string> = {
  auto_draft: "Pipeline",
  en_attente: "En attente",
  publie: "Publiés",
  rejete: "Rejetés",
  expire: "Expirés",
};

interface Action {
  label: string;
  statut: DealStatut;
  variant: "primaire" | "danger" | "neutre";
}

/** Actions contextuelles par onglet — parité v1 (index.html AdminPage, machine à états statut). */
const ONGLET_ACTIONS: Record<DealStatut, Action[]> = {
  auto_draft: [
    { label: "Valider", statut: "publie", variant: "primaire" },
    { label: "Rejeter", statut: "rejete", variant: "danger" },
  ],
  en_attente: [
    { label: "Valider", statut: "publie", variant: "primaire" },
    { label: "Rejeter", statut: "rejete", variant: "danger" },
  ],
  publie: [
    { label: "Expirer", statut: "expire", variant: "neutre" },
    { label: "Retirer", statut: "rejete", variant: "danger" },
  ],
  rejete: [
    { label: "Republier", statut: "publie", variant: "primaire" },
    { label: "Remettre en attente", statut: "en_attente", variant: "neutre" },
  ],
  expire: [{ label: "Republier", statut: "publie", variant: "primaire" }],
};

/** Sélection groupée réservée aux deux onglets de modération initiale (v1 : idem). */
const BULK_ONGLETS = new Set<DealStatut>(["auto_draft", "en_attente"]);

const ACTION_CLASSES: Record<Action["variant"], string> = {
  primaire: "bg-vert text-white",
  danger: "border border-rouge text-rouge",
  neutre: "border border-bordure text-muted",
};

export function AdminPipeline() {
  const [deals, setDeals] = useState<DealAdmin[] | null>(null);
  // Total réel renvoyé par l'API (count(*) over(), toutes statuts confondus
  // — l'appel n'est pas filtré par statut). Sert uniquement à détecter une
  // troncature par LIMIT ; ce n'est pas un total par onglet (l'API ne le
  // renvoie pas dans ce mode non filtré).
  const [total, setTotal] = useState(0);
  const [onglet, setOnglet] = useState<DealStatut>("en_attente");
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
    const body = (await res.json()) as { data: DealAdmin[]; total: number };
    setDeals(body.data);
    setTotal(body.total);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial au montage, pattern standard (https://react.dev/reference/react/useEffect#fetching-data-with-effects), pas de state dérivable du render
    void fetchDeals();
  }, [fetchDeals]);

  function changerOnglet(t: DealStatut) {
    setOnglet(t);
    setSelected(new Set());
  }

  const comptes = useMemo(() => {
    const c: Record<DealStatut, number> = { auto_draft: 0, en_attente: 0, publie: 0, rejete: 0, expire: 0 };
    for (const d of deals ?? []) c[d.statut] += 1;
    return c;
  }, [deals]);

  const parOnglet = useMemo(() => {
    if (!deals) return [];
    return deals.filter((d) => d.statut === onglet).sort(compareRemise);
  }, [deals, onglet]);

  function toggle(publicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }

  async function updateStatut(publicId: string, statut: DealStatut) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/deals/${publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Action impossible.");
        return;
      }
      await fetchDeals();
    } finally {
      setPending(false);
    }
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
      setSelected(new Set());
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
      <div className="flex border-b border-bordure overflow-x-auto">
        {ONGLETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changerOnglet(t)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${
              onglet === t ? "border-rouge text-rouge" : "border-transparent text-muted"
            }`}
          >
            {ONGLET_LABELS[t]} ({comptes[t]})
          </button>
        ))}
      </div>

      {deals.length < total && (
        <p className="text-xs text-muted">
          {deals.length} deals chargés sur {total} au total (tous statuts) — la limite serveur a tronqué le
          résultat, augmente LIMIT côté API si ça se reproduit.
        </p>
      )}

      {BULK_ONGLETS.has(onglet) && parOnglet.length > 0 && (
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
      )}

      {parOnglet.length === 0 && <p className="text-center text-muted py-16">Rien dans cet onglet.</p>}

      <ul className="flex flex-col gap-2">
        {parOnglet.map((deal) => (
          <li key={deal.publicId} className="bg-white border border-bordure rounded-xl p-4 flex items-start gap-3">
            {BULK_ONGLETS.has(onglet) && (
              <input
                type="checkbox"
                checked={selected.has(deal.publicId)}
                onChange={() => toggle(deal.publicId)}
                className="mt-1"
              />
            )}
            <div className="flex-1 flex flex-col gap-1">
              <span className="font-bold">{deal.titre}</span>
              <div className="text-xs text-muted">{joinMeta(deal.enseigneSlug, deal.ville, deal.categorie)}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-black text-rouge">{deal.prixPromo} DH</span>
                {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
                {remise(deal) > 0 && (
                  <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{remise(deal)}%</span>
                )}
              </div>
              {deal.whatsappContact && <div className="text-xs text-muted">WhatsApp : {deal.whatsappContact}</div>}
              <div className="text-xs text-muted">Soumis par {deal.submitterPublicId ?? "collecte automatique"}</div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              {ONGLET_ACTIONS[onglet].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => void updateStatut(deal.publicId, action.statut)}
                  disabled={pending}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${ACTION_CLASSES[action.variant]}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
