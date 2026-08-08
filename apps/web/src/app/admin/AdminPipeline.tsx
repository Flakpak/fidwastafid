"use client";

import { useCallback, useEffect, useState } from "react";
import type { DealAdmin, DealStatut, Enseigne } from "@fidwastafid/schemas";
import type { DoublonInfo } from "../api/v1/_lib/deals.js";
import {
  AdminDealItem,
  type DealEditFields,
  type SaveResult,
  type ImageFetchResult,
  type DiffusionResult,
  type AnnulationResult,
  type CanalDiffusion,
  type ModeDiffusion,
  type SuppressionResult,
} from "./AdminDealItem.js";
import { AdminDealSupprime, type RestaurationResult } from "./AdminDealSupprime.js";
import { MotifRejet } from "./MotifRejet.js";
import { Button } from "../../components/Button.js";

/** Deal admin enrichi de l'info de doublon produit (visibilité seule, lot du
 *  23/07/2026) — `doublon` vit hors du modèle de domaine (cf. _lib/deals.ts),
 *  d'où ce type local plutôt qu'un champ de DealAdmin. */
type DealAdminAvecDoublon = DealAdmin & { doublon: DoublonInfo | null };

interface ApiErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

/** `"supprime"` (lot 1) n'est PAS une valeur de `deals.statut` — c'est
 *  l'onglet dédié aux lignes `supprime_le is not null`, tous statuts
 *  d'origine confondus. Distinct du type `DealStatut` partout où la
 *  distinction compte (actions de modération, bulk). */
type Onglet = DealStatut | "supprime";

const ONGLETS_STATUT: DealStatut[] = ["auto_draft", "en_attente", "publie", "rejete", "expire"];

const ONGLET_LABELS: Record<DealStatut, string> = {
  auto_draft: "Pipeline",
  en_attente: "En attente",
  publie: "Publiés",
  rejete: "Rejetés",
  expire: "Expirés",
};

const COMPTES_INITIAUX: Record<DealStatut, number> = {
  auto_draft: 0,
  en_attente: 0,
  publie: 0,
  rejete: 0,
  expire: 0,
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
  // La liste chargée est déjà celle de L'ONGLET COURANT SEUL — filtrée en
  // base (`GET /api/v1/admin/deals?statut=…` ou `?supprime=true`), jamais
  // la table entière triée/filtrée côté client (docs/INCIDENTS.md,
  // 04/08/2026 : une soumission `en_attente` restait invisible derrière un
  // `LIMIT` global).
  const [deals, setDeals] = useState<DealAdminAvecDoublon[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [chargementPage, setChargementPage] = useState(false);
  // Comptes par onglet — TOUJOURS un count(*) en base
  // (`GET /api/v1/admin/deals/compte`), jamais la longueur de `deals` : cette
  // liste est paginée, elle ne peut pas se compter elle-même sans mentir sur
  // ce qu'elle n'a pas encore chargé.
  const [comptes, setComptes] = useState<Record<DealStatut, number>>(COMPTES_INITIAUX);
  const [comptesSupprimes, setComptesSupprimes] = useState(0);
  const [onglet, setOnglet] = useState<Onglet>("en_attente");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Le rejet groupé passe par le panneau de motif, jamais par le bouton seul. */
  const [demandeMotifLot, setDemandeMotifLot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function urlOnglet(o: Onglet): string {
    return o === "supprime" ? "/api/v1/admin/deals?supprime=true" : `/api/v1/admin/deals?statut=${o}`;
  }

  /** Charge la PREMIÈRE page d'un onglet (ou de l'onglet Supprimés) —
   *  remplace la liste affichée. */
  const fetchOnglet = useCallback(async (o: Onglet) => {
    setError(null);
    const res = await fetch(urlOnglet(o));
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.code === "UNAUTHENTICATED" || body.error?.code === "FORBIDDEN") {
        setError("Accès admin requis. Connecte-toi avec un compte administrateur.");
      } else {
        setError(body.error?.message ?? "Impossible de charger le pipeline.");
      }
      setDeals(null);
      setCursor(null);
      return;
    }
    const body = (await res.json()) as { data: DealAdminAvecDoublon[]; nextCursor: string | null };
    setDeals(body.data);
    setCursor(body.nextCursor);
  }, []);

  const fetchComptes = useCallback(async () => {
    const res = await fetch("/api/v1/admin/deals/compte");
    if (!res.ok) return;
    const body = (await res.json()) as { comptes: Record<DealStatut, number>; supprimes: number };
    setComptes(body.comptes);
    setComptesSupprimes(body.supprimes);
  }, []);

  /** Après toute mutation : reprend l'onglet courant depuis sa première page
   *  (un item peut en être sorti — statut changé, supprimé ou restauré — ou
   *  avoir bougé de rang) et rafraîchit les comptes, qu'elle que soit la
   *  mutation. */
  const rafraichir = useCallback(async () => {
    await Promise.all([fetchOnglet(onglet), fetchComptes()]);
  }, [onglet, fetchOnglet, fetchComptes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial au montage, pattern standard (https://react.dev/reference/react/useEffect#fetching-data-with-effects), pas de state dérivable du render
    void fetchOnglet(onglet);
    void fetchComptes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage seul (deps volontairement vides) : l'onglet initial est figé, changerOnglet() gère explicitement les changements d'onglet
  }, []);

  const chargerPlus = useCallback(async () => {
    if (!cursor || chargementPage) return;
    setChargementPage(true);
    try {
      const res = await fetch(`${urlOnglet(onglet)}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: DealAdminAvecDoublon[]; nextCursor: string | null };
      setDeals((prev) => [...(prev ?? []), ...body.data]);
      setCursor(body.nextCursor);
    } finally {
      setChargementPage(false);
    }
  }, [cursor, chargementPage, onglet]);

  function changerOnglet(t: Onglet) {
    setOnglet(t);
    setDeals(null);
    setCursor(null);
    setSelected(new Set());
    // Sinon le panneau de motif reste ouvert au-dessus d'une sélection vidée.
    setDemandeMotifLot(false);
    void fetchOnglet(t);
  }

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
      await rafraichir();
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
      await rafraichir();
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
    await rafraichir();
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
    await rafraichir();
    return { ok: true };
  }

  /** Diffusion communautaire (docs/IDEES.md) — un deal à la fois, jamais en
   *  masse. Rafraîchit au succès pour que la carte repasse en « Diffusé »
   *  d'après la base plutôt que d'après un état local optimiste :
   *  l'anti-double-publication doit refléter ce qui est écrit, pas ce qu'on
   *  croit avoir écrit. */
  async function diffuser(publicId: string, canal: CanalDiffusion, mode: ModeDiffusion): Promise<DiffusionResult> {
    const res = await fetch(`/api/v1/admin/deals/${publicId}/diffuser/${canal}?mode=${mode}`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      return { ok: false, message: body.error?.message ?? "Diffusion impossible." };
    }
    const body = (await res.json()) as { canalTest?: boolean };
    await rafraichir();
    return { ok: true, canalTest: Boolean(body.canalTest) };
  }

  /** Annulation d'une diffusion — retire le message du canal ET la ligne
   *  `diffusions`, rendant le deal rediffusable. Même relecture depuis la
   *  base au succès : l'état affiché doit venir de ce qui est écrit, jamais
   *  d'un optimisme local. */
  async function annulerDiffusion(publicId: string, canal: CanalDiffusion): Promise<AnnulationResult> {
    const res = await fetch(`/api/v1/admin/deals/${publicId}/diffuser/${canal}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      return { ok: false, message: body.error?.message ?? "Annulation impossible." };
    }
    await rafraichir();
    return { ok: true };
  }

  /** Suppression DOUCE (lot 1) — pose `supprime_le`, jamais un DELETE réel
   *  (voir DELETE /api/v1/admin/deals/:publicId). Rafraîchit l'onglet
   *  courant (la ligne en sort) et les comptes (elle quitte son badge,
   *  rejoint celui de l'onglet Supprimés). */
  async function supprimer(publicId: string): Promise<SuppressionResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/deals/${publicId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        return { ok: false, message: body.error?.message ?? "Suppression impossible." };
      }
      await rafraichir();
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  /** Restauration — efface `supprime_le`, renvoie le deal dans son statut
   *  D'ORIGINE (jamais touché par la suppression). Rafraîchit l'onglet
   *  Supprimés (la ligne en sort) et les comptes. */
  async function restaurer(publicId: string): Promise<RestaurationResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/deals/${publicId}/restaurer`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        return { ok: false, message: body.error?.message ?? "Restauration impossible." };
      }
      await rafraichir();
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  /**
   * `motifRejet` est exigé par l'API pour un rejet groupé (CONTRAT-V1 §3) —
   * l'endpoint bulk était sinon un contournement complet de l'obligation de
   * motiver. Le motif est commun au lot, ce qui correspond au geste réel :
   * rejeter d'un coup vingt `auto_draft` pour la même raison.
   */
  async function bulk(statut: "publie" | "rejete", motifRejet?: string) {
    if (selected.size === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/deals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds: Array.from(selected), statut, motifRejet }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Action groupée impossible.");
        return;
      }
      setSelected(new Set());
      setDemandeMotifLot(false);
      await rafraichir();
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return <p className="bg-surface border border-border rounded-xl p-5 text-center text-warn font-bold">{error}</p>;
  }

  if (!deals) {
    return <p className="text-center text-ink-muted py-16">Chargement…</p>;
  }

  const modeSupprimes = onglet === "supprime";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex border-b border-border overflow-x-auto">
        {ONGLETS_STATUT.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changerOnglet(t)}
            className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${
              onglet === t ? "border-accent text-accent" : "border-transparent text-ink-muted"
            }`}
          >
            {ONGLET_LABELS[t]} ({comptes[t]})
          </button>
        ))}
        {/* Onglet Supprimés (lot 1) — séparé des cinq statuts par un filet :
            ce n'est pas un statut de plus, c'est une vue transversale. */}
        <button
          type="button"
          onClick={() => changerOnglet("supprime")}
          className={`ml-2 pl-4 border-l border-border px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${
            modeSupprimes ? "border-accent text-accent" : "border-transparent text-ink-muted"
          }`}
        >
          Supprimés ({comptesSupprimes})
        </button>
      </div>

      {!modeSupprimes && BULK_ONGLETS.has(onglet) && deals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void bulk("publie")} disabled={pending || selected.size === 0}>
              Valider la sélection ({selected.size})
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDemandeMotifLot(true)}
              disabled={pending || selected.size === 0}
            >
              Rejeter la sélection
            </Button>
          </div>
          {demandeMotifLot && selected.size > 0 && (
            <MotifRejet
              libelleConfirmation={`Rejeter les ${selected.size}`}
              pending={pending}
              onAnnuler={() => setDemandeMotifLot(false)}
              onRejeter={(motif) => bulk("rejete", motif)}
            />
          )}
        </div>
      )}

      {deals.length === 0 && (
        <p className="text-center text-ink-muted py-16">
          {modeSupprimes ? "Aucun deal supprimé." : "Rien dans cet onglet."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {modeSupprimes
          ? deals.map((deal) => (
              <AdminDealSupprime
                key={deal.publicId}
                deal={deal}
                pending={pending}
                onRestaurer={() => restaurer(deal.publicId)}
              />
            ))
          : deals.map((deal) => (
              <AdminDealItem
                key={deal.publicId}
                deal={deal}
                doublon={deal.doublon}
                actions={ONGLET_ACTIONS[onglet as DealStatut]}
                enseignes={enseignes}
                showCheckbox={BULK_ONGLETS.has(onglet as DealStatut)}
                checked={selected.has(deal.publicId)}
                onToggle={() => toggle(deal.publicId)}
                pending={pending}
                onAction={(statut, motifRejet) => updateStatut(deal.publicId, statut, motifRejet)}
                onSaveFields={(fields) => saveDeal(deal.publicId, deal.statut, fields)}
                onFetchImageFromLink={() => fetchImageFromLink(deal.publicId)}
                onUploadImage={(file) => uploadImage(deal.publicId, file)}
                onDiffuser={(canal, mode) => diffuser(deal.publicId, canal, mode)}
                onAnnulerDiffusion={(canal) => annulerDiffusion(deal.publicId, canal)}
                onSupprimer={() => supprimer(deal.publicId)}
              />
            ))}
      </ul>

      {cursor && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => void chargerPlus()}
            disabled={chargementPage}
            className="min-h-11 rounded-full border border-border-strong bg-surface px-6 py-2 text-sm font-bold text-ink hover:bg-surface-subtle disabled:cursor-default disabled:opacity-50"
          >
            {chargementPage ? "Chargement…" : "Charger plus"}
          </button>
        </div>
      )}
    </div>
  );
}
