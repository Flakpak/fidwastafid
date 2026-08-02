"use client";

import { useState } from "react";
import { VILLES, CATEGORIES, dealUrlSlug, type DealAdmin, type DealStatut, type Enseigne } from "@fidwastafid/schemas";
import type { DoublonInfo } from "../api/v1/_lib/deals.js";
import { joinMeta } from "../../lib/format.js";
import { MotifRejet } from "./MotifRejet.js";

/** Libellés courts de statut pour le badge de doublon (l'onglet où retrouver
 *  l'existant). Le deal page public ne résout que publie/expire — pour les
 *  autres statuts, pas de fiche publique (cf. rendu du badge). */
const STATUT_LABEL: Record<DealStatut, string> = {
  auto_draft: "pipeline",
  en_attente: "en attente",
  publie: "publié",
  rejete: "rejeté",
  expire: "expiré",
};

/** Le deal existant a-t-il une fiche publique atteignable ? (CONTRAT-V1 §1 :
 *  seuls publie/expire répondent 200 ; auto_draft/en_attente/rejete → 404.) */
const STATUT_PUBLIC = new Set<string>(["publie", "expire"]);

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

/** `canalTest` remonte jusqu'à l'UI : un envoi vers le canal de test et un
 *  envoi vers le canal public ne se rapportent pas de la même façon. */
export type DiffusionResult = { ok: true; canalTest: boolean } | { ok: false; message: string };

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
  primaire: "bg-accent text-white hover:bg-accent-hi",
  danger: "bg-surface border border-hot-line text-hot hover:bg-hot-soft",
  neutre: "bg-surface border border-border-strong text-ink hover:bg-surface-subtle",
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
  return `border rounded-[7px] bg-surface text-ink px-2 py-1 font-normal text-sm focus:border-accent focus:outline-none ${
    hasError ? "border-warn" : "border-border-strong"
  }`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-warn text-xs font-semibold">{message}</p>;
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
  doublon,
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
  onDiffuser,
}: {
  deal: DealAdmin;
  /** Autre deal du même produit s'il en existe un (visibilité seule, lot du
   *  23/07/2026) — jamais d'action automatique, l'admin décide. */
  doublon?: DoublonInfo | null;
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
  onDiffuser: () => Promise<DiffusionResult>;
}) {
  const [fields, setFields] = useState<DealEditFields>(() => toEditFields(deal));
  /** Le rejet passe par le panneau de motif — jamais directement par le bouton. */
  const [demandeMotif, setDemandeMotif] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imgState, setImgState] = useState<"idle" | "pending" | "error">("idle");
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgCacheBust, setImgCacheBust] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [diffState, setDiffState] = useState<"idle" | "pending" | "error">("idle");
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffInfo, setDiffInfo] = useState<string | null>(null);
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

  /** Diffusion Telegram. Le succès n'est pas annoncé par un simple « OK » :
   *  `canalTest` dit si le message est parti vers le canal de test
   *  (TELEGRAM_CHAT_ID_TEST posée) plutôt que vers le canal public — un
   *  curateur doit savoir lequel des deux vient de se produire. */
  async function handleDiffuser() {
    setDiffState("pending");
    setDiffError(null);
    setDiffInfo(null);
    const result = await onDiffuser();
    if (result.ok) {
      setDiffState("idle");
      setDiffInfo(result.canalTest ? "Envoyé sur le canal de TEST" : null);
    } else {
      setDiffState("error");
      setDiffError(result.message);
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
    <li className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {showCheckbox && <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 accent-accent" />}
        {/* Photo visible directement dans la ligne du pipeline (pas
            seulement dans le panneau "Éditer le deal" replié) : l'admin doit
            pouvoir juger la photo soumise avant de Valider/Rejeter, sans
            devoir déplier le formulaire d'édition. */}
        {deal.imageKey && (
          <img
            src={`/img/deals/${deal.publicId}`}
            alt={deal.titre}
            className="w-14 h-14 object-cover rounded-lg border border-border flex-shrink-0"
          />
        )}
        <div className="flex-1 flex flex-col gap-1">
          <span className="font-bold">{deal.titre}</span>
          <div className="text-xs text-ink-muted">{joinMeta(deal.enseigneSlug ?? deal.nomVendeur, deal.ville, deal.categorie)}</div>
          <div className="flex items-baseline gap-2">
            <span className="font-black text-ink tabular-nums">{deal.prixPromo} DH</span>
            {deal.prixNormal && <span className="text-sm text-ink-subtle line-through tabular-nums">{deal.prixNormal} DH</span>}
            {remise(deal) > 0 && (
              <span className="text-xs font-bold bg-accent-soft text-accent rounded px-2 py-0.5 tabular-nums">-{remise(deal)}%</span>
            )}
          </div>
          {/* Badge doublon produit — INFORMATIF, aucune action automatique
              (lot du 23/07/2026) : signale un autre deal du même produit
              (même lien+enseigne, ou repli titre+enseigne si lien null).
              L'admin décide seul (valider, rejeter, ou éditer l'existant). */}
          {doublon && (
            <div className="text-xs bg-warn-soft border border-warn/40 rounded-lg px-2.5 py-1.5 text-ink flex flex-col gap-0.5">
              <span className="font-bold flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5 text-warn shrink-0">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                Produit déjà existant ({STATUT_LABEL[doublon.statut as DealStatut] ?? doublon.statut})
                {doublon.nb > 1 && ` — +${doublon.nb - 1} autre${doublon.nb - 1 > 1 ? "s" : ""}`}
              </span>
              <span className="text-ink-muted">
                son prix : <strong className="text-ink">{doublon.prixPromo} DH</strong>
                {doublon.prixPromo !== deal.prixPromo && (
                  <> — ce deal : <strong className="text-ink">{deal.prixPromo} DH</strong></>
                )}
                {!doublon.parLien && <> · rapproché par titre (lien absent)</>}
              </span>
              {STATUT_PUBLIC.has(doublon.statut) ? (
                <a
                  href={`/deal/${dealUrlSlug(doublon.titre, doublon.publicId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent font-semibold hover:underline w-fit"
                >
                  Voir sa fiche ↗
                </a>
              ) : (
                <span className="text-ink-muted">
                  réf. <code className="font-mono">{doublon.publicId}</code> — onglet «{" "}
                  {STATUT_LABEL[doublon.statut as DealStatut] ?? doublon.statut} »
                </span>
              )}
            </div>
          )}
          {/* Soumission acceptée alors que Turnstile était injoignable
              (migration 0010). Elle est passée SANS vérification anti-robot :
              c'est précisément le cas où la relecture humaine, seul filet
              restant, doit être plus attentive. Badge `warn` — une alerte, pas
              un rejet : la soumission peut être parfaitement légitime. */}
          {!deal.turnstileVerifie && (
            <div className="text-xs bg-warn-soft border border-warn/40 rounded-lg px-2.5 py-1.5 text-ink flex flex-col gap-0.5">
              <span className="font-bold flex items-center gap-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5 text-warn shrink-0">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                Soumission non vérifiée par Turnstile
              </span>
              <span className="text-ink-muted">
                Cloudflare était injoignable au moment de l&apos;envoi : la soumission est passée sans contrôle
                anti-robot. Rien ne dit qu&apos;elle est mauvaise — mais tu es le seul filet restant.
              </span>
            </div>
          )}
          <div className="text-xs text-ink-subtle">Soumis par {deal.submitterPublicId ?? "collecte automatique"}</div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              // Un rejet n'agit plus au clic : il ouvre le choix du motif
              // juste en dessous (CONTRAT-V1 §3 — un rejet sans motif est
              // refusé côté API, autant le demander ici plutôt que faire
              // échouer l'action).
              onClick={() =>
                action.statut === "rejete" ? setDemandeMotif(true) : void onAction(action.statut, undefined)
              }
              disabled={pending}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors duration-[130ms] disabled:opacity-50 motion-reduce:transition-none ${ACTION_CLASSES[action.variant]}`}
            >
              {action.label}
            </button>
          ))}

          {/* Diffusion communautaire (docs/IDEES.md) — curation MANUELLE,
              un deal à la fois : aucune diffusion groupée n'est proposée,
              volontairement. Le bouton n'apparaît que sur un deal `publie`,
              seul cas où l'API l'accepte (409 sinon) : proposer une action
              qui ne peut que rater n'est pas une action.
              Déjà diffusé → état inerte, pas un bouton désactivé : il n'y a
              plus rien à tenter, et la contrainte unique en base refuserait
              le second envoi de toute façon. */}
          {deal.statut === "publie" &&
            (deal.diffuseTelegram ? (
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-center bg-accent-soft border border-accent-line text-accent"
                title="Déjà publié sur le canal Telegram"
              >
                Diffusé ✓
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleDiffuser()}
                disabled={pending || diffState === "pending"}
                className="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border border-border-strong bg-surface text-ink hover:bg-surface-subtle disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
              >
                {diffState === "pending" ? "Diffusion..." : "Diffuser"}
              </button>
            ))}
          {diffError && <p className="text-warn text-xs font-bold max-w-[14rem]">{diffError}</p>}
          {diffInfo && <p className="text-accent text-xs font-bold max-w-[14rem]">{diffInfo}</p>}
        </div>
      </div>

      {demandeMotif && (
        <MotifRejet
          libelleConfirmation="Rejeter"
          pending={pending}
          onAnnuler={() => setDemandeMotif(false)}
          onRejeter={async (motif) => {
            await onAction("rejete", motif);
            setDemandeMotif(false);
          }}
        />
      )}

      <details className="border-t border-border pt-2">
        <summary className="text-xs font-bold text-ink-muted hover:text-ink cursor-pointer select-none">Éditer le deal</summary>
        <div className="mt-2 flex flex-col gap-2">
          {saveError && <p className="text-warn text-xs font-bold">{saveError}</p>}

          <label className="flex flex-col gap-1 text-xs font-bold">
            Titre
            <input
              value={fields.titre}
              onChange={(e) => set("titre", e.target.value)}
              maxLength={200}
              className={fieldClass(Boolean(fieldErrors.titre))}
            />
            <span className="text-xs text-ink-subtle font-normal">
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
              className="accent-accent"
            />
            Numéro affiché publiquement {fields.whatsappPublic ? "(consenti)" : "(admin uniquement)"}
          </label>

          <button
            type="button"
            onClick={() => void handleSaveFields()}
            disabled={savingFields || pending}
            className="self-start bg-accent text-white rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-accent-hi disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            {savingFields ? "Enregistrement..." : "Enregistrer"}
          </button>

          <div className="border-t border-border pt-2 mt-1 flex flex-col gap-2">
            {deal.lien && !isGoogleMapsUrl(deal.lien) && (
              <button
                type="button"
                onClick={() => void handleFetchImage()}
                disabled={imgState === "pending" || pending}
                className="self-start bg-surface border border-border-strong text-ink rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-surface-subtle disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
              >
                {imgState === "pending" ? "Récupération..." : "Récupérer l'image du lien"}
              </button>
            )}
            {imgState === "error" && imgError && <p className="text-warn text-xs font-bold">{imgError}</p>}

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
                className="self-start bg-surface border border-border-strong text-ink rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-surface-subtle disabled:opacity-50 flex-shrink-0 transition-colors duration-[130ms] motion-reduce:transition-none"
              >
                {uploadState === "pending" ? "Téléversement..." : "Téléverser une image"}
              </button>
            </div>
            {uploadState === "error" && uploadError && <p className="text-warn text-xs font-bold">{uploadError}</p>}

            {deal.imageKey && (
              <img
                src={`/img/deals/${deal.publicId}?admin_preview=${imgCacheBust}`}
                alt="Aperçu"
                className="max-h-32 w-auto object-contain self-start border border-border rounded"
              />
            )}
          </div>

          {/* Le champ « Motif » vivait ici, replié au fond du panneau
              d'édition, alors que « Rejeter » est en haut de la carte : on
              pouvait rejeter sans jamais le voir — c'est ce qui s'est produit
              au premier rejet réel en prod (27/07/2026). Il est remonté au
              moment du rejet, avec des raccourcis (voir MotifRejet.tsx). */}
          {deal.motifRejet && (
            <p className="text-xs text-ink-muted mt-1">
              Motif enregistré : <span className="font-bold text-ink">{deal.motifRejet}</span>
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
