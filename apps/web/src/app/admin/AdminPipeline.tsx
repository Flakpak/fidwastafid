"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type DealAdmin, type DealStatut, type Enseigne } from "@fidwastafid/schemas";
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

/**
 * Filtres de la file (lot du 12/08/2026) — mêmes clés que les paramètres
 * `GET /api/v1/admin/deals` acceptés côté serveur (`_lib/adminDealsFilters.ts`).
 * Chaîne vide = pas de filtre, jamais `undefined` : des champs contrôlés
 * React ont besoin d'une valeur stable, et une chaîne vide est l'état neutre
 * naturel d'un input texte/date.
 */
interface Filtres {
  enseigne: string;
  categorie: string;
  remiseMin: string;
  remiseMax: string;
  prixMin: string;
  prixMax: string;
  /** `<input type=date>`, sans heure — `apiDateMax()` l'étend à la fin de
   *  journée avant l'appel API, pour que le jour choisi soit inclus. */
  dateMin: string;
  dateMax: string;
}

const FILTRES_VIDES: Filtres = {
  enseigne: "",
  categorie: "",
  remiseMin: "",
  remiseMax: "",
  prixMin: "",
  prixMax: "",
  dateMin: "",
  dateMax: "",
};

const TRI_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tri par défaut de l'onglet" },
  { value: "date_desc", label: "Date d'insertion — plus récent d'abord" },
  { value: "date_asc", label: "Date d'insertion — plus ancien d'abord" },
  { value: "remise_desc", label: "Remise — plus haute d'abord" },
  { value: "remise_asc", label: "Remise — plus basse d'abord" },
  { value: "prix_desc", label: "Prix — plus cher d'abord" },
  { value: "prix_asc", label: "Prix — moins cher d'abord" },
];

function filtresDepuisParams(params: URLSearchParams): Filtres {
  return {
    enseigne: params.get("enseigne") ?? "",
    categorie: params.get("categorie") ?? "",
    remiseMin: params.get("remiseMin") ?? "",
    remiseMax: params.get("remiseMax") ?? "",
    prixMin: params.get("prixMin") ?? "",
    prixMax: params.get("prixMax") ?? "",
    dateMin: params.get("dateMin") ?? "",
    dateMax: params.get("dateMax") ?? "",
  };
}

function ongletDepuisParams(params: URLSearchParams): Onglet {
  const brut = params.get("onglet");
  if (brut === "supprime") return "supprime";
  if (brut && (ONGLETS_STATUT as string[]).includes(brut)) return brut as DealStatut;
  return "en_attente";
}

/** Fin de journée LOCALE (pas UTC) — `<input type=date>` renvoie une date
 *  sans heure, la comparer telle quelle à `created_at` (`timestamptz`)
 *  exclurait la quasi-totalité de la journée choisie (minuit UTC ≠ minuit
 *  local, et une comparaison à minuit pile exclut de toute façon tout ce
 *  qui a été inséré plus tard ce jour-là). */
function finDeJournee(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).toISOString();
}

/** Paramètres d'URL communs à un chargement (onglet + filtres + tri) —
 *  UNE fonction pour construire à la fois l'URL de navigation (partageable,
 *  valeurs brutes) et l'URL d'appel API (`dateMax` étendu). */
function paramsCommuns(onglet: Onglet, filtres: Filtres, tri: string): URLSearchParams {
  const params = new URLSearchParams();
  if (onglet !== "en_attente") params.set("onglet", onglet);
  if (filtres.enseigne) params.set("enseigne", filtres.enseigne);
  if (filtres.categorie) params.set("categorie", filtres.categorie);
  if (filtres.remiseMin) params.set("remiseMin", filtres.remiseMin);
  if (filtres.remiseMax) params.set("remiseMax", filtres.remiseMax);
  if (filtres.prixMin) params.set("prixMin", filtres.prixMin);
  if (filtres.prixMax) params.set("prixMax", filtres.prixMax);
  if (filtres.dateMin) params.set("dateMin", filtres.dateMin);
  if (filtres.dateMax) params.set("dateMax", filtres.dateMax);
  if (tri) params.set("tri", tri);
  return params;
}

export function AdminPipeline({ enseignes }: { enseignes: Enseigne[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // La liste chargée est déjà celle de L'ONGLET COURANT SEUL, avec les
  // FILTRES ACTIFS — filtrés et triés EN BASE (`GET /api/v1/admin/deals`),
  // jamais la table entière triée/filtrée côté client (docs/INCIDENTS.md,
  // 04/08/2026 : une soumission `en_attente` restait invisible derrière un
  // `LIMIT` global — c'est exactement le motif que ce lot évite pour les
  // filtres/tri).
  const [deals, setDeals] = useState<DealAdminAvecDoublon[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [chargementPage, setChargementPage] = useState(false);
  // Comptes par onglet — TOUJOURS un count(*) en base
  // (`GET /api/v1/admin/deals/compte`), jamais la longueur de `deals` : cette
  // liste est paginée, elle ne peut pas se compter elle-même sans mentir sur
  // ce qu'elle n'a pas encore chargé. Volontairement PAS filtrés par les
  // filtres actifs : le badge d'onglet répond « combien dans ce statut au
  // total », les filtres répondent « combien j'en vois ici ».
  const [comptes, setComptes] = useState<Record<DealStatut, number>>(COMPTES_INITIAUX);
  const [comptesSupprimes, setComptesSupprimes] = useState(0);
  // État initial lu depuis l'URL (partage/retour arrière, lot du 12/08/2026)
  // — un `useState(() => …)` lazy pour le premier rendu ; les navigations
  // SUIVANTES (internes via `appliquerNavigation`, ou externes — retour
  // arrière du navigateur) sont reprises par l'effet réactif à
  // `searchParams` plus bas, seule façon de couvrir les deux origines.
  const [onglet, setOnglet] = useState<Onglet>(() => ongletDepuisParams(searchParams));
  const [filtres, setFiltres] = useState<Filtres>(() => filtresDepuisParams(searchParams));
  const [tri, setTri] = useState<string>(() => searchParams.get("tri") ?? "");
  /** Filtres non encore appliqués — les inputs sont contrôlés par cet état
   *  local, jamais directement par `filtres` : un déclenchement réseau par
   *  frappe (remise/prix numériques) serait une rafale de requêtes pour un
   *  filtre qui n'a bien souvent de sens qu'à la dernière frappe. */
  const [filtresBrouillon, setFiltresBrouillon] = useState<Filtres>(filtres);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Le rejet groupé passe par le panneau de motif, jamais par le bouton seul. */
  const [demandeMotifLot, setDemandeMotifLot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** URL d'appel API pour un (onglet, filtres, tri) donné — `dateMax` étendu
   *  à la fin de journée locale (voir `finDeJournee`), pour que le jour
   *  choisi soit inclus plutôt qu'exclu par une comparaison à minuit. */
  function urlApi(o: Onglet, f: Filtres, t: string): string {
    if (o === "supprime") return "/api/v1/admin/deals?supprime=true";
    const params = paramsCommuns(o, f, t);
    params.delete("onglet"); // c'est `statut` côté API, pas `onglet`.
    params.set("statut", o);
    if (f.dateMax) params.set("dateMax", finDeJournee(f.dateMax));
    return `/api/v1/admin/deals?${params.toString()}`;
  }

  /** Pose l'état courant dans l'URL — `replace` (pas `push`) : chaque
   *  ajustement de filtre ne doit pas empiler une entrée d'historique par
   *  champ modifié, seulement refléter l'état final pour qu'il soit
   *  partageable et retrouvé après un retour arrière DEPUIS cette page vers
   *  ailleurs dans l'admin, pas pour naviguer champ par champ en arrière. */
  function syncUrl(o: Onglet, f: Filtres, t: string) {
    const params = paramsCommuns(o, f, t);
    const qs = params.toString();
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  }

  /** Charge la PREMIÈRE page d'un (onglet, filtres, tri) — remplace la liste
   *  affichée. */
  const fetchOnglet = useCallback(async (o: Onglet, f: Filtres, t: string) => {
    setError(null);
    const res = await fetch(urlApi(o, f, t));
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

  /** Après toute mutation : reprend l'onglet/filtres/tri courants depuis
   *  leur première page (un item peut en être sorti — statut changé,
   *  supprimé ou restauré — ou avoir bougé de rang) et rafraîchit les
   *  comptes, qu'elle que soit la mutation. */
  const rafraichir = useCallback(async () => {
    await Promise.all([fetchOnglet(onglet, filtres, tri), fetchComptes()]);
  }, [onglet, filtres, tri, fetchOnglet, fetchComptes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- montage seul, comptes indépendants des filtres/onglet
    void fetchComptes();
  }, [fetchComptes]);

  /**
   * Montage seul : charge la première page, quoi qu'il arrive. Sans cet
   * effet dédié, seul l'effet réactif à `searchParams` ci-dessous chargeait
   * la liste — mais sa garde anti-redondance compare l'URL à l'état déjà
   * affiché, et au tout premier rendu les deux sont IDENTIQUES (le state
   * initial est dérivé de la même URL par les mêmes fonctions) : la garde
   * était donc trivialement vraie dès le montage, l'effet retournait sans
   * jamais appeler `fetchOnglet`, et la page restait bloquée sur «
   * Chargement… » indéfiniment (incident du 12/08/2026 — jamais reproduit
   * en local faute de compte admin en production pour l'observer avant
   * fusion). Ce second effet garantit un appel initial indépendamment de la
   * garde ; le doublon au montage est impossible, la garde ci-dessous étant
   * alors trivialement vraie et ne refait rien.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- montage seul, cas initial de la garde ci-dessous
    void fetchOnglet(onglet, filtres, tri);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage seul (deps volontairement vides) : l'état initial est figé, l'effet réactif à searchParams gère les changements ultérieurs
  }, []);

  /**
   * Réagit à `searchParams` plutôt qu'à un montage unique — c'est ce qui
   * fait « survivre au retour arrière » (lot du 12/08/2026) : le bouton
   * précédent/suivant du navigateur change l'URL sans repasser par
   * `appliquerNavigation` (posé par CE composant), seul un effet qui observe
   * l'URL elle-même peut recharger l'état correspondant. Se compare à l'état
   * déjà affiché pour ignorer les changements d'URL que ce composant vient
   * de poser lui-même (`syncUrl`) — sinon chaque navigation interne
   * déclencherait un second chargement identique, redondant. Au montage,
   * cette comparaison est TOUJOURS vraie (voir l'effet dédié ci-dessus) :
   * ce n'est pas un cas à gérer ici, seulement la conséquence attendue de
   * ne pas dupliquer le chargement initial.
   */
  useEffect(() => {
    const o = ongletDepuisParams(searchParams);
    const f = filtresDepuisParams(searchParams);
    const t = searchParams.get("tri") ?? "";
    if (o === onglet && JSON.stringify(f) === JSON.stringify(filtres) && t === tri) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dérive l'état affiché depuis l'URL, seule source de vérité pour survivre à une navigation externe (retour arrière)
    setOnglet(o);
    setFiltres(f);
    setFiltresBrouillon(f);
    setTri(t);
    setDeals(null);
    setCursor(null);
    setSelected(new Set());
    setDemandeMotifLot(false);
    void fetchOnglet(o, f, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'à l'URL ; (onglet, filtres, tri) sont lus pour comparer à l'état COURANT, pas pour déclencher cet effet
  }, [searchParams]);

  const chargerPlus = useCallback(async () => {
    if (!cursor || chargementPage) return;
    setChargementPage(true);
    try {
      const res = await fetch(`${urlApi(onglet, filtres, tri)}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: DealAdminAvecDoublon[]; nextCursor: string | null };
      setDeals((prev) => [...(prev ?? []), ...body.data]);
      setCursor(body.nextCursor);
    } finally {
      setChargementPage(false);
    }
  }, [cursor, chargementPage, onglet, filtres, tri]);

  /** Tout changement d'onglet, de filtre ou de tri RÉINITIALISE le curseur
   *  de pagination — sans ça, un curseur de la position précédente serait
   *  rejoué sur un jeu de résultats différent (le serveur le refuse déjà,
   *  `AdminDealsCursor.filtres`, mais repartir de la première page est le
   *  comportement attendu, pas une erreur à afficher). */
  function appliquerNavigation(o: Onglet, f: Filtres, t: string) {
    setOnglet(o);
    setFiltres(f);
    setTri(t);
    setDeals(null);
    setCursor(null);
    setSelected(new Set());
    // Sinon le panneau de motif reste ouvert au-dessus d'une sélection vidée.
    setDemandeMotifLot(false);
    syncUrl(o, f, t);
    void fetchOnglet(o, f, t);
  }

  function changerOnglet(o: Onglet) {
    appliquerNavigation(o, filtres, tri);
  }

  function appliquerFiltres() {
    appliquerNavigation(onglet, filtresBrouillon, tri);
  }

  function reinitialiserFiltres() {
    setFiltresBrouillon(FILTRES_VIDES);
    appliquerNavigation(onglet, FILTRES_VIDES, tri);
  }

  function changerTri(t: string) {
    appliquerNavigation(onglet, filtres, t);
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

      {/* Filtres — combinables en AND avec l'onglet, filtrés/triés EN BASE
          (voir `urlApi`/`route.ts`, jamais côté client). Appliqués
          explicitement (bouton), pas à chaque frappe : un champ numérique
          déclencherait une requête par chiffre tapé pour un filtre qui n'a
          de sens qu'une fois complet. */}
      <div className="bg-surface-subtle border border-border rounded-xl p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Source
            <select
              value={filtresBrouillon.enseigne}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, enseigne: e.target.value }))}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Toutes</option>
              {enseignes.map((ens) => (
                <option key={ens.slug} value={ens.slug}>
                  {ens.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Catégorie
            <select
              value={filtresBrouillon.categorie}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, categorie: e.target.value }))}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Toutes</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Remise % min
            <input
              type="number"
              min={0}
              max={100}
              value={filtresBrouillon.remiseMin}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, remiseMin: e.target.value }))}
              className="w-20 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Remise % max
            <input
              type="number"
              min={0}
              max={100}
              value={filtresBrouillon.remiseMax}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, remiseMax: e.target.value }))}
              className="w-20 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Prix min (DH)
            <input
              type="number"
              min={0}
              value={filtresBrouillon.prixMin}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, prixMin: e.target.value }))}
              className="w-24 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Prix max (DH)
            <input
              type="number"
              min={0}
              value={filtresBrouillon.prixMax}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, prixMax: e.target.value }))}
              className="w-24 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Inséré depuis le
            <input
              type="date"
              value={filtresBrouillon.dateMin}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, dateMin: e.target.value }))}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Jusqu&apos;au
            <input
              type="date"
              value={filtresBrouillon.dateMax}
              onChange={(e) => setFiltresBrouillon((f) => ({ ...f, dateMax: e.target.value }))}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Tri
            <select
              value={tri}
              onChange={(e) => changerTri(e.target.value)}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            >
              {TRI_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" size="sm" onClick={appliquerFiltres}>
            Appliquer les filtres
          </Button>
          <Button variant="secondary" size="sm" onClick={reinitialiserFiltres}>
            Réinitialiser
          </Button>
        </div>
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
