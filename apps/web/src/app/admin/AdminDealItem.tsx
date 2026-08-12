"use client";

import { useState } from "react";
import { VILLES, CATEGORIES, dealUrlSlug, type DealAdmin, type DealStatut, type Enseigne } from "@fidwastafid/schemas";
import type { DoublonInfo } from "../api/v1/_lib/deals.js";
import { joinMeta, shortDate } from "../../lib/format.js";
import { MotifRejet } from "./MotifRejet.js";

/** Libellés courts de statut pour le badge de doublon (l'onglet où retrouver
 *  l'existant). Le deal page public ne résout que publie/expire — pour les
 *  autres statuts, pas de fiche publique (cf. rendu du badge). */
export const STATUT_LABEL: Record<DealStatut, string> = {
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

/** Annulation : retire le message du canal ET la ligne `diffusions`. Un échec
 *  laisse les deux en place — l'étiquette « Diffusé ✓ » reste alors vraie. */
export type AnnulationResult = { ok: true } | { ok: false; message: string };

/** Suppression DOUCE (lot 1) — jamais un DELETE réel, voir DELETE
 *  /api/v1/admin/deals/:publicId. Réversible depuis l'onglet Supprimés. */
export type SuppressionResult = { ok: true } | { ok: false; message: string };

/** Canaux de diffusion exposés par l'admin (docs/IDEES.md). WhatsApp n'y
 *  figure pas : semi-manuel assumé, l'API Meta ne poste pas dans les groupes. */
export type CanalDiffusion = "telegram" | "discord";

/** Mode EXPLICITE (CONTRAT-V1 §4, dix-septième amendement conscient) — plus
 *  de préférence ambiante entre `_TEST` et production : l'admin choisit. */
export type ModeDiffusion = "production" | "test";

/**
 * Bouton de diffusion d'UN canal. Composant à part, avec son propre état :
 * deux canaux qui partageraient un `pending` afficheraient « Diffusion... »
 * sur Discord pendant un envoi Telegram, et un échec de l'un effacerait le
 * message de l'autre. L'indépendance des canaux se voit jusque dans l'UI.
 */
function BoutonDiffusion({
  libelle,
  diffuse,
  pending,
  onDiffuser,
  onAnnuler,
}: {
  libelle: string;
  diffuse: boolean;
  pending: boolean;
  onDiffuser: (mode: ModeDiffusion) => Promise<DiffusionResult>;
  onAnnuler: () => Promise<AnnulationResult>;
}) {
  const [etat, setEtat] = useState<"idle" | "pending">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Deux temps sur l'annulation : le geste touche un canal public. */
  const [confirmAnnul, setConfirmAnnul] = useState(false);

  async function diffuser(mode: ModeDiffusion) {
    setEtat("pending");
    setErreur(null);
    setInfo(null);
    const r = await onDiffuser(mode);
    setEtat("idle");
    if (r.ok) setInfo(r.canalTest ? "Envoyé sur la destination de TEST" : null);
    else setErreur(r.message);
  }

  /** Un échec laisse volontairement l'étiquette « Diffusé ✓ » : elle reste
   *  vraie tant que le message est dans le canal. */
  async function annuler() {
    setEtat("pending");
    setErreur(null);
    setInfo(null);
    const r = await onAnnuler();
    setEtat("idle");
    setConfirmAnnul(false);
    if (r.ok) setInfo("Retiré du canal");
    else setErreur(r.message);
  }

  return (
    <>
      {diffuse ? (
        <>
          <span
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-center bg-accent-soft border border-accent-line text-accent"
            title={`Déjà publié sur ${libelle}`}
          >
            {libelle} ✓
          </span>
          <button
            type="button"
            onClick={() => (confirmAnnul ? void annuler() : setConfirmAnnul(true))}
            disabled={pending || etat === "pending"}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border transition-colors duration-[130ms] disabled:opacity-50 motion-reduce:transition-none ${
              confirmAnnul
                ? "border-hot-line bg-surface text-hot hover:bg-hot-soft"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-subtle"
            }`}
          >
            {etat === "pending" ? "Annulation..." : confirmAnnul ? "Confirmer le retrait" : "Retirer"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void diffuser("production")}
            disabled={pending || etat === "pending"}
            className="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border border-border-strong bg-surface text-ink hover:bg-surface-subtle disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            {etat === "pending" ? "Diffusion..." : `Diffuser sur ${libelle}`}
          </button>
          {/* Mode explicite (dix-septième amendement conscient) : un envoi de
              TEST se demande, il ne se devine plus d'une variable présente ou
              non. Absence de destination de test configurée → refus lisible
              dans `erreur`, jamais un envoi vers le canal public. */}
          <button
            type="button"
            onClick={() => void diffuser("test")}
            disabled={pending || etat === "pending"}
            title={`Envoyer sur la destination de TEST ${libelle}`}
            className="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border border-border-strong bg-surface text-ink-muted hover:bg-surface-subtle disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            Tester
          </button>
        </>
      )}
      {erreur && <p className="text-warn text-xs font-bold max-w-[14rem]">{erreur}</p>}
      {info && <p className="text-accent text-xs font-bold max-w-[14rem]">{info}</p>}
    </>
  );
}

/**
 * Suppression douce (lot 1) — deux temps, comme l'annulation de diffusion :
 * un geste qui rend un deal invisible partout mérite de nommer ce qu'il
 * touche, pas un clic sec. « Supprimer » reste discret (texte, pas un
 * bouton plein) — §8 règle 1, une seule action pleine par écran, déjà
 * occupée par l'action de modération principale de la carte.
 */
function BoutonSupprimer({
  titre,
  pending,
  onSupprimer,
}: {
  titre: string;
  pending: boolean;
  onSupprimer: () => Promise<SuppressionResult>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [etat, setEtat] = useState<"idle" | "pending">("idle");
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setEtat("pending");
    setErreur(null);
    const r = await onSupprimer();
    setEtat("idle");
    if (!r.ok) {
      setErreur(r.message);
      setConfirme(false);
    }
  }

  if (confirme) {
    return (
      <div className="flex flex-col gap-1 items-end">
        <p className="text-xs font-bold text-ink text-right max-w-[12rem]">
          Supprimer « {titre} » ? Réversible depuis l&apos;onglet Supprimés.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirme(false)}
            disabled={pending || etat === "pending"}
            className="text-xs font-bold text-ink-muted hover:text-ink cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void supprimer()}
            disabled={pending || etat === "pending"}
            className="rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer border border-hot-line bg-surface text-hot hover:bg-hot-soft disabled:opacity-50 transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            {etat === "pending" ? "Suppression..." : "Confirmer"}
          </button>
        </div>
        {erreur && <p className="text-warn text-xs font-bold max-w-[12rem] text-right">{erreur}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirme(true)}
      disabled={pending}
      className="text-xs font-bold text-ink-subtle hover:text-hot cursor-pointer disabled:opacity-50 self-end"
    >
      Supprimer
    </button>
  );
}

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
  onAnnulerDiffusion,
  onSupprimer,
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
  onDiffuser: (canal: CanalDiffusion, mode: ModeDiffusion) => Promise<DiffusionResult>;
  onAnnulerDiffusion: (canal: CanalDiffusion) => Promise<AnnulationResult>;
  onSupprimer: () => Promise<SuppressionResult>;
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
          {/* Date d'insertion + lien produit — les deux étaient déjà dans le
              payload (DealAdmin.createdAt/lien), simplement pas affichés sur
              la ligne : c'était le manque identifié pour décider sans devoir
              ouvrir le panneau « Éditer » (état des lieux du 12/08/2026). */}
          <div className="text-xs text-ink-subtle flex items-center gap-2 flex-wrap">
            <span>Inséré le {shortDate(deal.createdAt)}</span>
            {deal.lien && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={deal.lien}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-accent font-semibold hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Voir le produit ↗
                </a>
              </>
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

          {/* Diffusion communautaire (docs/IDEES.md) — curation MANUELLE, un
              deal et un canal à la fois : aucune diffusion groupée, et les
              deux canaux sont indépendants (diffuser sur Discord un deal déjà
              sur Telegram est légitime, l'anti-double-envoi est par canal).
              Les boutons n'apparaissent que sur un deal publié, seul cas où
              l'API les accepte (409 sinon) : proposer une action qui ne peut
              que rater n'est pas une action. */}
          {deal.statut === "publie" && (
            <>
              <BoutonDiffusion
                libelle="Telegram"
                diffuse={deal.diffuseTelegram}
                pending={pending}
                onDiffuser={(mode) => onDiffuser("telegram", mode)}
                onAnnuler={() => onAnnulerDiffusion("telegram")}
              />
              <BoutonDiffusion
                libelle="Discord"
                diffuse={deal.diffuseDiscord}
                pending={pending}
                onDiffuser={(mode) => onDiffuser("discord", mode)}
                onAnnuler={() => onAnnulerDiffusion("discord")}
              />
            </>
          )}

          <BoutonSupprimer titre={deal.titre} pending={pending} onSupprimer={onSupprimer} />
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
