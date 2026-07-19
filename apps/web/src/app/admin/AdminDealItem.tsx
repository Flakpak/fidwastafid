"use client";

import { useState } from "react";
import { VILLES, CATEGORIES, type DealAdmin, type DealStatut, type Enseigne } from "@fidwastafid/schemas";
import { joinMeta } from "../../lib/format.js";

/** Édition curateur complète d'un deal (CONTRAT-V1 §3/§4, troisième
 *  amendement conscient du 19/07/2026) — un champ vidé côté formulaire pour
 *  un champ FACULTATIF (description/prixNormal/ville/dateFin/lien/terrain)
 *  n'efface pas la valeur existante côté API (coalesce, limite acceptée,
 *  même comportement que les champs terrain avant cet amendement) ; un
 *  champ OBLIGATOIRE vidé (titre/prixPromo/categorie/type) est envoyé tel
 *  quel et rejeté par la validation serveur, avec un message par champ. */
export interface DealEditFields {
  titre: string;
  description: string;
  prixPromo: string;
  prixNormal: string;
  categorie: string;
  type: string;
  ville: string;
  dateFin: string;
  lien: string;
  /** "" = aucune enseigne (envoyé comme `null`, déliaison explicite). */
  enseigneSlug: string;
  nomVendeur: string;
  adresse: string;
  lienMaps: string;
  whatsappContact: string;
  whatsappPublic: boolean;
}

export type SaveResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };
export type ImageFetchResult = { ok: true } | { ok: false; message: string };

function toEditFields(deal: DealAdmin): DealEditFields {
  return {
    titre: deal.titre,
    description: deal.description ?? "",
    prixPromo: String(deal.prixPromo),
    prixNormal: deal.prixNormal !== undefined ? String(deal.prixNormal) : "",
    categorie: deal.categorie,
    type: deal.type,
    ville: deal.ville ?? "",
    dateFin: deal.dateFin ?? "",
    lien: deal.lien ?? "",
    enseigneSlug: deal.enseigneSlug ?? "",
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

/** Même pattern que SoumettreForm.tsx (fieldClass/FieldError) — dupliqué
 *  volontairement, deux composants distincts (admin vs soumission
 *  publique) qui ne doivent pas dépendre l'un de l'autre pour un helper de
 *  deux lignes. */
function fieldClass(hasError: boolean): string {
  return `border rounded px-2 py-1 font-normal text-sm ${hasError ? "border-rouge" : "border-bordure"}`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-rouge text-xs font-semibold">{message}</p>;
}

/**
 * Détection (heuristique d'affichage, pas une validation) d'un lien Google
 * Maps stocké par erreur dans le champ `lien` — le bouton "récupérer
 * l'image du lien" n'a de sens que pour un lien produit, jamais une fiche
 * Maps. Mêmes hôtes que `isLienMapsAutorise` (packages/schemas/src/deal.ts),
 * dupliqué ici volontairement : fonction non exportée côté schémas, et un
 * faux négatif ici ne fait qu'afficher un bouton en trop, jamais un risque
 * de sécurité (la vraie validation vit côté serveur).
 */
function isGoogleMapsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hostname === "maps.app.goo.gl" || url.hostname === "maps.google.com") return true;
  if ((url.hostname === "google.com" || url.hostname === "www.google.com") && url.pathname.startsWith("/maps")) {
    return true;
  }
  if (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")) return true;
  return false;
}

/**
 * Ligne de deal du pipeline admin — le panneau `<details>` est un formulaire
 * d'édition complet (CONTRAT-V1 §3/§4, troisième amendement conscient du
 * 19/07/2026) : le curateur peut corriger n'importe quel champ métier du
 * deal (titre, prix, catégorie, type, ville, lien, enseigne...), en plus des
 * champs terrain (nomVendeur/adresse/lienMaps/whatsapp) déjà éditables, et
 * récupérer l'image produit depuis le lien existant.
 */
export function AdminDealItem({
  deal,
  actions,
  enseignes,
  showCheckbox,
  checked,
  onToggle,
  pending,
  onAction,
  onSaveFields,
  onFetchImageFromLink,
  onUploadImage,
}: {
  deal: DealAdmin;
  actions: Action[];
  enseignes: Enseigne[];
  showCheckbox: boolean;
  checked: boolean;
  onToggle: () => void;
  pending: boolean;
  onAction: (statut: DealStatut, motifRejet?: string) => void | Promise<void>;
  onSaveFields: (fields: DealEditFields) => Promise<SaveResult>;
  onFetchImageFromLink: () => Promise<ImageFetchResult>;
  onUploadImage: (file: File) => Promise<ImageFetchResult>;
}) {
  const [fields, setFields] = useState<DealEditFields>(() => toEditFields(deal));
  const [motifRejet, setMotifRejet] = useState("");
  const [savingFields, setSavingFields] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imgState, setImgState] = useState<"idle" | "pending" | "error">("idle");
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgCacheBust, setImgCacheBust] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "pending" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  function set<K extends keyof DealEditFields>(key: K, value: DealEditFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSaveFields() {
    setSavingFields(true);
    setFieldErrors({});
    setSaveError(null);
    try {
      const result = await onSaveFields(fields);
      if (!result.ok) {
        setSaveError(result.message);
        setFieldErrors(result.fields ?? {});
      }
    } finally {
      setSavingFields(false);
    }
  }

  async function handleFetchImage() {
    setImgState("pending");
    setImgError(null);
    const result = await onFetchImageFromLink();
    if (result.ok) {
      setImgState("idle");
      setImgCacheBust((n) => n + 1);
    } else {
      setImgState("error");
      setImgError(result.message);
    }
  }

  async function handleUploadImage() {
    if (!uploadFile) return;
    setUploadState("pending");
    setUploadError(null);
    const result = await onUploadImage(uploadFile);
    if (result.ok) {
      setUploadState("idle");
      setUploadFile(null);
      setImgCacheBust((n) => n + 1);
    } else {
      setUploadState("error");
      setUploadError(result.message);
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
        <summary className="text-xs font-bold text-muted cursor-pointer select-none">Éditer le deal</summary>
        <div className="mt-2 flex flex-col gap-2">
          {saveError && <p className="text-rouge text-xs font-bold">{saveError}</p>}

          <label className="flex flex-col gap-1 text-xs font-bold">
            Titre
            <input
              value={fields.titre}
              onChange={(e) => set("titre", e.target.value)}
              maxLength={200}
              className={fieldClass(Boolean(fieldErrors.titre))}
            />
            <span className="text-xs text-muted font-normal">
              Modifier le titre change l&apos;URL — l&apos;ancienne redirige automatiquement.
            </span>
            <FieldError message={fieldErrors.titre} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Description
            <textarea
              value={fields.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
              rows={2}
              className={fieldClass(Boolean(fieldErrors.description))}
            />
            <FieldError message={fieldErrors.description} />
          </label>

          <div className="flex gap-2">
            <label className="flex-1 min-w-0 flex flex-col gap-1 text-xs font-bold">
              Prix promo (DH)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fields.prixPromo}
                onChange={(e) => set("prixPromo", e.target.value)}
                className={`w-full min-w-0 ${fieldClass(Boolean(fieldErrors.prixPromo))}`}
              />
              <FieldError message={fieldErrors.prixPromo} />
            </label>
            <label className="flex-1 min-w-0 flex flex-col gap-1 text-xs font-bold">
              Prix normal (DH)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fields.prixNormal}
                onChange={(e) => set("prixNormal", e.target.value)}
                className={`w-full min-w-0 ${fieldClass(Boolean(fieldErrors.prixNormal))}`}
              />
              <FieldError message={fieldErrors.prixNormal} />
            </label>
          </div>

          <div className="flex gap-2">
            <label className="flex-1 min-w-0 flex flex-col gap-1 text-xs font-bold">
              Catégorie
              <select
                value={fields.categorie}
                onChange={(e) => set("categorie", e.target.value)}
                className={fieldClass(Boolean(fieldErrors.categorie))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.categorie} />
            </label>
            <label className="flex-1 min-w-0 flex flex-col gap-1 text-xs font-bold">
              Type
              <select
                value={fields.type}
                onChange={(e) => set("type", e.target.value)}
                className={fieldClass(Boolean(fieldErrors.type))}
              >
                <option value="physique">En magasin</option>
                <option value="en_ligne">En ligne</option>
                <option value="les_deux">Les deux</option>
              </select>
              <FieldError message={fieldErrors.type} />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Ville
            <select
              value={fields.ville}
              onChange={(e) => set("ville", e.target.value)}
              className={fieldClass(Boolean(fieldErrors.ville))}
            >
              <option value="">— non précisé —</option>
              {VILLES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.ville} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Enseigne
            <select
              value={fields.enseigneSlug}
              onChange={(e) => set("enseigneSlug", e.target.value)}
              className={fieldClass(Boolean(fieldErrors.enseigneSlug))}
            >
              <option value="">— Aucune enseigne —</option>
              {enseignes.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.nom}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.enseigneSlug} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Fin de l&apos;offre
            <input
              type="date"
              value={fields.dateFin}
              onChange={(e) => set("dateFin", e.target.value)}
              className={fieldClass(Boolean(fieldErrors.dateFin))}
            />
            <FieldError message={fieldErrors.dateFin} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Lien de l&apos;offre
            <input
              type="url"
              value={fields.lien}
              onChange={(e) => set("lien", e.target.value)}
              className={fieldClass(Boolean(fieldErrors.lien))}
            />
            <FieldError message={fieldErrors.lien} />
          </label>

          <label className="flex flex-col gap-1 text-xs font-bold">
            Nom du commerce
            <input
              value={fields.nomVendeur}
              onChange={(e) => set("nomVendeur", e.target.value)}
              maxLength={80}
              className={fieldClass(Boolean(fieldErrors.nomVendeur))}
            />
            <FieldError message={fieldErrors.nomVendeur} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            Adresse
            <input
              value={fields.adresse}
              onChange={(e) => set("adresse", e.target.value)}
              maxLength={200}
              className={fieldClass(Boolean(fieldErrors.adresse))}
            />
            <FieldError message={fieldErrors.adresse} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            Lien Maps
            <input
              value={fields.lienMaps}
              onChange={(e) => set("lienMaps", e.target.value)}
              className={fieldClass(Boolean(fieldErrors.lienMaps))}
            />
            <FieldError message={fieldErrors.lienMaps} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            WhatsApp
            <input
              value={fields.whatsappContact}
              onChange={(e) => set("whatsappContact", e.target.value)}
              placeholder="0612345678 ou +212612345678"
              className={fieldClass(Boolean(fieldErrors.whatsappContact))}
            />
            <FieldError message={fieldErrors.whatsappContact} />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={fields.whatsappPublic}
              onChange={(e) => set("whatsappPublic", e.target.checked)}
            />
            Numéro affiché publiquement {fields.whatsappPublic ? "(consenti)" : "(admin uniquement)"}
          </label>

          <button
            type="button"
            onClick={() => void handleSaveFields()}
            disabled={savingFields || pending}
            className="self-start bg-bleu text-white rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            {savingFields ? "Enregistrement..." : "Enregistrer"}
          </button>

          <div className="border-t border-bordure pt-2 mt-1 flex flex-col gap-2">
            {deal.lien && !isGoogleMapsUrl(deal.lien) && (
              <button
                type="button"
                onClick={() => void handleFetchImage()}
                disabled={imgState === "pending" || pending}
                className="self-start bg-or text-texte rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              >
                {imgState === "pending" ? "Récupération..." : "🖼️ Récupérer l'image du lien"}
              </button>
            )}
            {imgState === "error" && imgError && <p className="text-rouge text-xs font-bold">{imgError}</p>}

            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-xs flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => void handleUploadImage()}
                disabled={!uploadFile || uploadState === "pending" || pending}
                className="self-start bg-or text-texte rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 flex-shrink-0"
              >
                {uploadState === "pending" ? "Téléversement..." : "Téléverser une image"}
              </button>
            </div>
            {uploadState === "error" && uploadError && <p className="text-rouge text-xs font-bold">{uploadError}</p>}

            {deal.imageKey && (
              <img
                src={`/img/deals/${deal.publicId}?admin_preview=${imgCacheBust}`}
                alt="Aperçu"
                className="max-h-32 w-auto object-contain self-start border border-bordure rounded"
              />
            )}
          </div>

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
