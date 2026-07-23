"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DealAdmin, DealStatut, Enseigne } from "@fidwastafid/schemas";
import type { DoublonInfo } from "../api/v1/_lib/deals.js";
import { AdminDealItem, type DealEditFields, type SaveResult, type ImageFetchResult } from "./AdminDealItem.js";

/** Deal admin enrichi de l'info de doublon produit (visibilité seule, lot du
 *  23/07/2026) — `doublon` vit hors du modèle de domaine (cf. _lib/deals.ts),
 *  d'où ce type local plutôt qu'un champ de DealAdmin. */
type DealAdminAvecDoublon = DealAdmin & { doublon: DoublonInfo | null };

interface ApiErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
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

export function AdminPipeline({ enseignes }: { enseignes: Enseigne[] }) {
  const [deals, setDeals] = useState<DealAdminAvecDoublon[] | null>(null);
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
    const body = (await res.json()) as { data: DealAdminAvecDoublon[]; total: number };
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

  async function updateStatut(publicId: string, statut: DealStatut, motifRejet?: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/deals/${publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut, motifRejet: statut === "rejete" ? motifRejet : undefined }),
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

  /**
   * Édition curateur complète (CONTRAT-V1 §3/§4, troisième amendement
   * conscient du 19/07/2026) — statut inchangé (renvoyé tel quel, requis par
   * le schéma de mise à jour admin). Champs obligatoires (titre/prixPromo/
   * categorie/type) envoyés tels quels : un champ vidé par erreur doit être
   * rejeté par la validation serveur, pas silencieusement ignoré. Champs
   * facultatifs : chaîne vide -> undefined (coalesce côté API laisse la
   * valeur existante intacte, limite acceptée, même comportement que les
   * champs terrain). `enseigneSlug` fait exception : "" -> `null`
   * (déliaison explicite, distincte d'"inchangé").
   *
   * Retourne le résultat à AdminDealItem (au lieu de seulement peupler
   * l'erreur de page) pour permettre l'affichage par champ (pattern
   * `fields`, cf. SoumettreForm.tsx).
   */
  async function saveDeal(publicId: string, statutActuel: DealStatut, fields: DealEditFields): Promise<SaveResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/deals/${publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statut: statutActuel,
          titre: fields.titre,
          description: fields.description || undefined,
          prixPromo: Number(fields.prixPromo),
          prixNormal: fields.prixNormal ? Number(fields.prixNormal) : undefined,
          categorie: fields.categorie,
          type: fields.type,
          ville: fields.ville || undefined,
          dateFin: fields.dateFin || undefined,
          lien: fields.lien || undefined,
          enseigneSlug: fields.enseigneSlug === "" ? null : fields.enseigneSlug,
          nomVendeur: fields.nomVendeur || undefined,
          adresse: fields.adresse || undefined,
          lienMaps: fields.lienMaps || undefined,
          whatsappContact: fields.whatsappContact || undefined,
          whatsappPublic: fields.whatsappPublic,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        return { ok: false, message: body.error?.message ?? "Mise à jour impossible.", fields: body.error?.fields };
      }
      await fetchDeals();
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  /** Volet image (CONTRAT-V1 §4, troisième amendement conscient du
   *  19/07/2026) — pas de `pending` global ici : l'état "en cours" reste
   *  local à AdminDealItem, un fetch externe (page + image) peut prendre
   *  plusieurs secondes et ne doit pas geler le reste du pipeline. */
  async function fetchImageFromLink(publicId: string): Promise<ImageFetchResult> {
    const res = await fetch(`/api/v1/admin/deals/${publicId}/image-depuis-lien`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      return { ok: false, message: body.error?.message ?? "Récupération de l'image impossible." };
    }
    await fetchDeals();
    return { ok: true };
  }

  /** Fallback manuel (extension du troisième amendement conscient, même
   *  date) — sources qui bloquent image-depuis-lien (Jumia et similaires,
   *  403 sur IP datacenter). Pas de header Content-Type : le navigateur
   *  pose lui-même le boundary multipart pour un FormData. */
  async function uploadImage(publicId: string, file: File): Promise<ImageFetchResult> {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`/api/v1/admin/deals/${publicId}/image`, { method: "POST", body: formData });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      return { ok: false, message: body.error?.message ?? "Téléversement impossible." };
    }
    await fetchDeals();
    return { ok: true };
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
          <AdminDealItem
            key={deal.publicId}
            deal={deal}
            doublon={deal.doublon}
            actions={ONGLET_ACTIONS[onglet]}
            enseignes={enseignes}
            showCheckbox={BULK_ONGLETS.has(onglet)}
            checked={selected.has(deal.publicId)}
            onToggle={() => toggle(deal.publicId)}
            pending={pending}
            onAction={(statut, motifRejet) => updateStatut(deal.publicId, statut, motifRejet)}
            onSaveFields={(fields) => saveDeal(deal.publicId, deal.statut, fields)}
            onFetchImageFromLink={() => fetchImageFromLink(deal.publicId)}
            onUploadImage={(file) => uploadImage(deal.publicId, file)}
          />
        ))}
      </ul>
    </div>
  );
}
