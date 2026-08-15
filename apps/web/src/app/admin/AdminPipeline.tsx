"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type PartageWhatsappResult,
  type SuppressionResult,
} from "./AdminDealItem.js";
import { AdminDealSupprime, type RestaurationResult } from "./AdminDealSupprime.js";
import { AdminLots, type LotResume, type AnnulerLotResult } from "./AdminLots.js";
import { AdminDiffusionLot } from "./AdminDiffusionLot.js";
import { MotifRejet } from "./MotifRejet.js";
import { Button } from "../../components/Button.js";
import { ONGLET_ACTIONS, type ActionOnglet } from "../api/v1/_lib/adminDealsActions.js";
import { SOURCES_ADMIN, SOURCE_INCONNUE_SLUG } from "../../lib/sourcesAdmin.js";

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

/** `ActionOnglet["variant"]` (français) → `Button["variant"]` (anglais, le
 *  composant partagé) — deux vocabulaires distincts, jamais fusionnés :
 *  `ActionOnglet` est aussi consommé par le serveur (`bulk-filtre/route.ts`),
 *  qui n'a rien à faire d'un nom de classe Tailwind. */
const BOUTON_VARIANT: Record<ActionOnglet["variant"], "primary" | "danger" | "secondary"> = {
  primaire: "primary",
  danger: "danger",
  neutre: "secondary",
};

/** Sélection groupée pour la diffusion (lot du 15/08/2026, dix-neuvième
 *  amendement conscient) — distincte des actions de statut ci-dessus : ne
 *  change jamais le statut d'un deal, ne s'applique donc qu'aux deals déjà
 *  publiés. Partage le même état `selected`, jamais actif en même temps
 *  qu'un autre onglet (la sélection est vidée à chaque changement d'onglet). */
const DIFFUSION_ONGLETS = new Set<DealStatut>(["publie"]);

/**
 * Filtres de la file (lot du 12/08/2026) — mêmes clés que les paramètres
 * `GET /api/v1/admin/deals` acceptés côté serveur (`_lib/adminDealsFilters.ts`).
 * Chaîne vide = pas de filtre, jamais `undefined` : des champs contrôlés
 * React ont besoin d'une valeur stable, et une chaîne vide est l'état neutre
 * naturel d'un input texte/date.
 */
interface Filtres {
  enseigne: string;
  /** Site scrapé (dérivé de `lien`, jamais une colonne — lib/sourcesAdmin.ts).
   *  Distinct d'`enseigne` : carrefour.ma et bringo.ma partagent la même
   *  enseigne "Carrefour" sans partager de domaine. */
  source: string;
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
  source: "",
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
    source: params.get("source") ?? "",
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
  if (filtres.source) params.set("source", filtres.source);
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
  /** Vrai pendant qu'une nouvelle page (onglet/filtre/tri) est en vol —
   *  distinct de `deals === null` (lot du 15/08/2026, friction filtre) :
   *  `deals` n'est plus jamais remis à `null` après le premier chargement,
   *  la liste déjà affichée reste visible (légèrement atténuée) pendant le
   *  chargement suivant plutôt que de disparaître puis réapparaître. */
  const [chargementListe, setChargementListe] = useState(false);
  /** Incrémenté à chaque appel de `fetchOnglet` — une réponse dont le
   *  numéro ne correspond plus au plus récent est périmée (l'utilisateur a
   *  changé de filtre entretemps) et n'écrit rien : sans ce garde-fou,
   *  appliquer un filtre au changement (plus de clic « Appliquer ») peut
   *  faire partir plusieurs requêtes qui reviennent dans le désordre. */
  const requeteListeRef = useRef(0);
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
  /** Nombre EXACT de lignes que le filtre actif toucherait (lot du
   *  12/08/2026, `GET /admin/deals/compte-filtre`) — `null` tant qu'il n'a
   *  pas encore été chargé pour ce (onglet, filtres). Alimente la
   *  confirmation de « traiter tout le résultat filtré » : la personne doit
   *  lire le nombre exact, pas un ordre de grandeur. */
  const [compteFiltre, setCompteFiltre] = useState<number | null>(null);
  /** Rejet groupé PAR FILTRE — motif d'abord (comme la sélection manuelle). */
  const [demandeMotifLotFiltre, setDemandeMotifLotFiltre] = useState(false);
  /** Confirmation nommant le nombre exact + les filtres appliqués — posée
   *  au-delà du seuil (voir `SEUIL_CONFIRMATION`), quel que soit le verbe. */
  const [confirmationLotFiltre, setConfirmationLotFiltre] = useState<{
    verbe: DealStatut;
    motifRejet?: string;
  } | null>(null);
  /** Pendant de `confirmationLotFiltre` pour la restauration (onglet
   *  Supprimés, un seul verbe possible — pas de `motifRejet`, un booléen
   *  suffit). */
  const [confirmationRestaurerFiltre, setConfirmationRestaurerFiltre] = useState(false);
  /** Onglet « Lots récents » (lot du 12/08/2026) — vue INDÉPENDANTE de
   *  `onglet`/`filtres`/`tri` : pas un statut de deal, une catégorie
   *  d'action admin. `null` tant que non chargé (distinct de `[]`, liste
   *  réellement vide). */
  const [vueLots, setVueLots] = useState(false);
  const [lots, setLots] = useState<LotResume[] | null>(null);
  /** Panneau de diffusion en masse (lot du 15/08/2026) — ouvert par un des
   *  deux boutons « Diffuser la sélection », fermé par son propre bouton
   *  Fermer. `null` = fermé. La liste `publicIds` est figée à l'ouverture,
   *  comme le lot lui-même côté serveur. */
  const [panelDiffusion, setPanelDiffusion] = useState<{ canal: "telegram" | "discord"; publicIds: string[] } | null>(
    null
  );
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

  /** Paramètres onglet+filtres SEULS (pas de tri, pas de curseur — hors
   *  sujet pour un compte ou une action groupée) — communs à
   *  `compte-filtre`, `bulk-filtre` et `restaurer-bulk-filtre`, garantit
   *  que TOUS visent exactement le même jeu de lignes que la liste
   *  affichée. `o === "supprime"` bascule sur `?supprime=true` plutôt que
   *  `?statut=` — même exclusivité que `GET /admin/deals` (lot du
   *  15/08/2026, « tout sélectionner », étendu à l'onglet Supprimés). */
  function paramsFiltreSeul(o: Onglet, f: Filtres): URLSearchParams {
    const params = paramsCommuns(o, f, "");
    params.delete("onglet");
    params.delete("tri");
    if (o === "supprime") params.set("supprime", "true");
    else params.set("statut", o);
    if (f.dateMax) params.set("dateMax", finDeJournee(f.dateMax));
    return params;
  }

  function urlCompteFiltre(o: Onglet, f: Filtres): string {
    return `/api/v1/admin/deals/compte-filtre?${paramsFiltreSeul(o, f).toString()}`;
  }

  function urlBulkFiltre(o: Onglet, f: Filtres): string {
    return `/api/v1/admin/deals/bulk-filtre?${paramsFiltreSeul(o, f).toString()}`;
  }

  function urlRestaurerBulkFiltre(f: Filtres): string {
    return `/api/v1/admin/deals/restaurer-bulk-filtre?${paramsFiltreSeul("supprime", f).toString()}`;
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
   *  affichée. Charge aussi `compteFiltre` (lot du 12/08/2026), SEULEMENT
   *  sur les onglets où l'action groupée par filtre est offerte — inutile
   *  ailleurs. */
  const fetchOnglet = useCallback(async (o: Onglet, f: Filtres, t: string) => {
    const requeteId = ++requeteListeRef.current;
    setError(null);
    setChargementListe(true);
    const res = await fetch(urlApi(o, f, t));
    // Une requête plus récente est déjà partie (nouveau changement de
    // filtre/onglet/tri pendant que celle-ci était en vol) : cette réponse
    // périmée n'écrit rien — la requête la plus récente gère seule l'état
    // (y compris `chargementListe`, qu'elle finira par repasser à `false`).
    if (requeteListeRef.current !== requeteId) return;
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error?.code === "UNAUTHENTICATED" || body.error?.code === "FORBIDDEN") {
        setError("Accès admin requis. Connecte-toi avec un compte administrateur.");
      } else {
        setError(body.error?.message ?? "Impossible de charger le pipeline.");
      }
      setDeals(null);
      setCursor(null);
      setCompteFiltre(null);
      setChargementListe(false);
      return;
    }
    const body = (await res.json()) as { data: DealAdminAvecDoublon[]; nextCursor: string | null };
    setDeals(body.data);
    setCursor(body.nextCursor);

    // Chargé pour l'onglet Supprimés (une seule action, restaurer) et pour
    // tout onglet de statut portant au moins une action (les cinq, à ce
    // jour — `ONGLET_ACTIONS`, source unique avec les boutons affichés).
    const compteFiltreApplicable = o === "supprime" || ONGLET_ACTIONS[o as DealStatut].length > 0;
    if (compteFiltreApplicable) {
      const resCompte = await fetch(urlCompteFiltre(o, f));
      if (requeteListeRef.current !== requeteId) return;
      if (resCompte.ok) {
        const bodyCompte = (await resCompte.json()) as { total: number };
        setCompteFiltre(bodyCompte.total);
      } else {
        setCompteFiltre(null);
      }
    } else {
      setCompteFiltre(null);
    }
    setChargementListe(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlApi/urlCompteFiltre sont des fonctions pures du composant, pas des dépendances réactives distinctes de (o, f, t) déjà passés en paramètres
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
    // PAS de `setDeals(null)` (retiré le 15/08/2026, friction filtre) : la
    // liste déjà affichée reste visible pendant que `fetchOnglet` charge la
    // suivante (`chargementListe` l'atténue), au lieu de disparaître
    // derrière « Chargement… » à chaque changement de filtre.
    setCursor(null);
    setSelected(new Set());
    // Sinon le panneau de motif reste ouvert au-dessus d'une sélection vidée.
    setDemandeMotifLot(false);
    setVueLots(false);
    syncUrl(o, f, t);
    void fetchOnglet(o, f, t);
  }

  function changerOnglet(o: Onglet) {
    appliquerNavigation(o, filtres, tri);
  }

  const fetchLots = useCallback(async () => {
    const res = await fetch("/api/v1/admin/deals/lots");
    if (!res.ok) return;
    const body = (await res.json()) as { data: LotResume[] };
    setLots(body.data);
  }, []);

  function afficherLots() {
    setVueLots(true);
    setLots(null);
    void fetchLots();
  }

  /** Défait un lot — rafraîchit la liste des lots (le nombre de « sautés »
   *  y devient visible) ET les comptes par onglet (des deals ont changé de
   *  statut, leurs badges doivent le refléter au retour sur un onglet
   *  normal). */
  async function annulerLot(lot: string): Promise<AnnulerLotResult> {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/admin/deals/lots/${encodeURIComponent(lot)}/annuler`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        return { ok: false, message: body.error?.message ?? "Annulation du lot impossible." };
      }
      const body = (await res.json()) as { revertes: number; sautes: number };
      await Promise.all([fetchLots(), fetchComptes()]);
      return { ok: true, revertes: body.revertes, sautes: body.sautes };
    } finally {
      setPending(false);
    }
  }

  /** Filtres à sélection fermée (menu, date) — s'appliquent AU CHANGEMENT,
   *  comme le tri (corrigé le 15/08/2026 : l'incohérence entre un tri
   *  immédiat et un filtre qui exigeait un clic « Appliquer » coûtait un
   *  geste à chaque changement, des dizaines de fois par session). Un menu
   *  ou un `<input type=date>` complet ne déclenche qu'UN `onChange` par
   *  choix — pas de risque de rafale, contrairement aux champs numériques
   *  ci-dessous (débounce dédié). */
  function appliquerFiltreImmediat(patch: Partial<Filtres>) {
    const next = { ...filtresBrouillon, ...patch };
    setFiltresBrouillon(next);
    appliquerNavigation(onglet, next, tri);
  }

  function reinitialiserFiltres() {
    setFiltresBrouillon(FILTRES_VIDES);
    appliquerNavigation(onglet, FILTRES_VIDES, tri);
  }

  function changerTri(t: string) {
    appliquerNavigation(onglet, filtres, t);
  }

  /**
   * Débounce des QUATRE champs numériques (remise/prix min/max) — seuls
   * champs de ce panneau où chaque frappe déclenche `onChange` (contraire
   * aux menus/dates ci-dessus) : sans délai, taper "150" partirait en trois
   * requêtes (1, 15, 150) pour un filtre qui n'a de sens qu'à la dernière.
   * Se déclenche à chaque frappe (dépendances = les quatre champs du
   * brouillon), compare au dernier filtre RÉELLEMENT appliqué — si rien n'a
   * changé depuis (ex. la frappe précédente vient d'être appliquée), ne
   * relance rien. `clearTimeout` en nettoyage : chaque nouvelle frappe
   * annule le délai précédent, seul le dernier survit — un débounce
   * classique.
   */
  const DEBOUNCE_FILTRES_NUMERIQUES_MS = 400;
  useEffect(() => {
    const brouillonNum = {
      remiseMin: filtresBrouillon.remiseMin,
      remiseMax: filtresBrouillon.remiseMax,
      prixMin: filtresBrouillon.prixMin,
      prixMax: filtresBrouillon.prixMax,
    };
    const appliqueNum = {
      remiseMin: filtres.remiseMin,
      remiseMax: filtres.remiseMax,
      prixMin: filtres.prixMin,
      prixMax: filtres.prixMax,
    };
    if (JSON.stringify(brouillonNum) === JSON.stringify(appliqueNum)) return;
    const timer = setTimeout(() => {
      appliquerNavigation(onglet, filtresBrouillon, tri);
    }, DEBOUNCE_FILTRES_NUMERIQUES_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'aux quatre champs numériques du brouillon ; onglet/tri/filtres sont lus au moment du déclenchement, pas des dépendances (sinon un changement d'onglet relancerait ce débounce sans qu'aucun champ numérique n'ait bougé)
  }, [filtresBrouillon.remiseMin, filtresBrouillon.remiseMax, filtresBrouillon.prixMin, filtresBrouillon.prixMax]);

  function toggle(publicId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }

  /**
   * Retire des lignes de la liste affichée SANS refetch (lot du 15/08/2026,
   * friction de modération sur 253 deals — un `rafraichir()` par action
   * remplaçait toute la première page à chaque clic, perdant la position de
   * défilement). Jamais appelée avant confirmation serveur : pas d'optimisme
   * qui mentirait sur un échec, l'état local ne bouge qu'après un 200.
   * `publicIds` doit toujours venir de ce que le serveur a RÉELLEMENT modifié
   * (`updated`, pas la sélection demandée) — un id périmé silencieusement
   * ignoré côté API ne doit pas disparaître localement comme s'il l'avait été.
   */
  function retirerDesListe(publicIds: string[], statutCible: DealStatut) {
    if (publicIds.length === 0) return;
    const ids = new Set(publicIds);
    setDeals((prev) => (prev ? prev.filter((d) => !ids.has(d.publicId)) : prev));
    setComptes((prev) => {
      const next = { ...prev };
      // `onglet` est toujours un DealStatut ici : cette fonction n'est
      // appelée que depuis le flux de modération par statut, jamais depuis
      // l'onglet "supprime" (AdminDealSupprime ne l'utilise pas).
      if (onglet !== "supprime") next[onglet] = Math.max(0, next[onglet] - ids.size);
      next[statutCible] = (next[statutCible] ?? 0) + ids.size;
      return next;
    });
    // Toute ligne présente dans `deals` a déjà passé le filtre actif (filtré
    // en base, jamais côté client) — sa sortie de liste vaut donc aussi pour
    // le compte filtré affiché par "Traiter TOUT le résultat filtré".
    setCompteFiltre((prev) => (prev === null ? prev : Math.max(0, prev - ids.size)));
  }

  /**
   * Pendant de `retirerDesListe` pour l'onglet Supprimés (lot du 15/08/2026,
   * « tout sélectionner », étendu le même jour à la restauration PAR FILTRE
   * — friction « ramène en page 1 ») — restaurer n'a qu'UNE cible de
   * comptage (`comptesSupprimes`, qui décroît), mais la DESTINATION varie
   * par ligne : chaque deal revient dans son propre statut D'ORIGINE.
   * `entries` vient du SERVEUR (`LigneRestauree[]`, `_lib/
   * adminDealsRestaurerBulk.ts`), jamais relu depuis `deals` chargé — au
   * niveau filtre, une ligne restaurée peut ne jamais avoir été chargée à
   * l'écran, son statut d'origine n'existe donc nulle part côté client
   * avant cette réponse.
   */
  function retirerDesListeSupprimee(entries: { publicId: string; statutOrigine: DealStatut }[]) {
    if (entries.length === 0) return;
    const ids = new Set(entries.map((e) => e.publicId));
    setDeals((prev) => (prev ? prev.filter((d) => !ids.has(d.publicId)) : prev));
    setComptesSupprimes((c) => Math.max(0, c - entries.length));
    setComptes((prev) => {
      const next = { ...prev };
      for (const e of entries) next[e.statutOrigine] = (next[e.statutOrigine] ?? 0) + 1;
      return next;
    });
    setCompteFiltre((prev) => (prev === null ? prev : Math.max(0, prev - ids.size)));
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
      retirerDesListe([publicId], statut);
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

  /** Partage WhatsApp manuel (lot du 15/08/2026) — pas de `rafraichir()` :
   *  cette action n'écrit rien sur le deal lui-même (ni statut, ni
   *  `diffusions`), seulement `journal_audit` côté serveur. Rien à
   *  refléter dans la liste affichée. */
  async function partagerWhatsapp(publicId: string): Promise<PartageWhatsappResult> {
    const res = await fetch(`/api/v1/admin/deals/${publicId}/partage-whatsapp`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json()) as ApiErrorBody;
      return { ok: false, message: body.error?.message ?? "Génération du message impossible." };
    }
    const body = (await res.json()) as { message: string };
    return { ok: true, message: body.message };
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
  async function bulk(statut: DealStatut, motifRejet?: string) {
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
      // `updated`, pas `selected` : un id périmé entre la sélection et
      // l'appel (déjà traité ailleurs, supprimé) est ignoré silencieusement
      // côté serveur (route bulk) — le retirer quand même localement le
      // ferait disparaître comme s'il avait été traité ici, un mensonge.
      const body = (await res.json()) as { updated: string[]; lot: string };
      retirerDesListe(body.updated, statut);
      setSelected(new Set());
      setDemandeMotifLot(false);
    } finally {
      setPending(false);
    }
  }

  /**
   * Action groupée PAR FILTRE (lot du 12/08/2026) — `statut` et les
   * filtres vivent dans l'URL de l'appel (`urlBulkFiltre`), jamais un
   * `publicIds` transmis : le serveur résout lui-même les lignes touchées,
   * avec le MÊME prédicat que ce que l'écran affiche.
   *
   * Retrait LOCAL (`retirerDesListe`), pas un `rafraichir()` (corrigé le
   * 15/08/2026 — même friction que #141 pour la sélection manuelle, restée
   * sur ce chemin) : `body.updated` porte TOUS les id réellement touchés,
   * qu'ils aient été chargés à l'écran ou non. `retirerDesListe` filtre déjà
   * `deals` par appartenance à cet ensemble — une ligne jamais chargée n'y
   * est simplement jamais présente, rien à en retirer visuellement, mais
   * les COMPTEURS (`comptes`, `compteFiltre`) se mettent à jour sur la
   * taille réelle de `updated`, pas sur ce qui était visible. Le verbe est
   * unique pour tout l'appel (contrairement à la restauration ci-dessous),
   * `retirerDesListe(ids, verbe)` suffit sans donnée supplémentaire du
   * serveur.
   */
  async function bulkFiltre(verbe: DealStatut, motifRejet?: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(urlBulkFiltre(onglet, filtres), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verbe, motifRejet }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Action groupée impossible.");
        return;
      }
      const body = (await res.json()) as { updated: string[]; lot: string; touched: number };
      retirerDesListe(body.updated, verbe);
      setDemandeMotifLotFiltre(false);
      setConfirmationLotFiltre(null);
    } finally {
      setPending(false);
    }
  }

  /** Restauration groupée, sélection MANUELLE (onglet Supprimés) — pendant
   *  de `bulk()`, appelle `restaurer-bulk` plutôt que `bulk`, retire les
   *  lignes localement (`retirerDesListeSupprimee`) plutôt qu'un refetch
   *  complet — même motif que `bulk()` : ne pas perdre la position de
   *  défilement pour une action qui peut toucher jusqu'à 100 lignes. */
  async function restaurerBulk() {
    if (selected.size === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/deals/restaurer-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Restauration groupée impossible.");
        return;
      }
      const body = (await res.json()) as { restaures: { publicId: string; statutOrigine: DealStatut }[]; lot: string };
      retirerDesListeSupprimee(body.restaures);
      setSelected(new Set());
    } finally {
      setPending(false);
    }
  }

  /** Restauration groupée PAR FILTRE (onglet Supprimés) — pendant de
   *  `bulkFiltre()`, un seul verbe possible (restaurer), donc pas de corps
   *  JSON à construire. Retrait LOCAL (corrigé le 15/08/2026, même friction
   *  que `bulkFiltre()`) : `body.restaures` porte, PAR LIGNE, le statut
   *  d'origine (`LigneRestauree`) — c'est précisément ce qui manque pour
   *  mettre à jour `comptes` sans deviner, y compris pour les lignes jamais
   *  chargées à l'écran (la destination varie ligne à ligne, contrairement
   *  à `bulkFiltre` où un seul verbe vaut pour tout l'appel). */
  async function restaurerBulkFiltre() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(urlRestaurerBulkFiltre(filtres), { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        setError(body.error?.message ?? "Restauration groupée impossible.");
        return;
      }
      const body = (await res.json()) as {
        restaures: { publicId: string; statutOrigine: DealStatut }[];
        lot: string;
        touched: number;
      };
      retirerDesListeSupprimee(body.restaures);
      setConfirmationRestaurerFiltre(false);
    } finally {
      setPending(false);
    }
  }

  /** Au-delà de ce nombre, une confirmation nommant le compte exact et les
   *  filtres appliqués s'interpose — en-deçà, le geste reste direct (même
   *  seuil que pour la sélection manuelle n'en a pas besoin : elle est déjà
   *  bornée par ce qui est visible et coché à l'écran). */
  const SEUIL_CONFIRMATION = 20;

  /** Résumé lisible des filtres actifs — porté par la confirmation : la
   *  personne doit lire CE QU'ELLE s'apprête à faire, pas seulement combien. */
  function resumeFiltres(f: Filtres): string {
    const parts: string[] = [];
    if (f.enseigne) {
      const nom = enseignes.find((e) => e.slug === f.enseigne)?.nom ?? f.enseigne;
      parts.push(`Enseigne : ${nom}`);
    }
    if (f.source) {
      const label =
        f.source === SOURCE_INCONNUE_SLUG
          ? "inconnue"
          : (SOURCES_ADMIN.find((s) => s.slug === f.source)?.label ?? f.source);
      parts.push(`Source : ${label}`);
    }
    if (f.categorie) parts.push(`Catégorie : ${f.categorie}`);
    if (f.remiseMin) parts.push(`Remise ≥ ${f.remiseMin}%`);
    if (f.remiseMax) parts.push(`Remise ≤ ${f.remiseMax}%`);
    if (f.prixMin) parts.push(`Prix ≥ ${f.prixMin} DH`);
    if (f.prixMax) parts.push(`Prix ≤ ${f.prixMax} DH`);
    if (f.dateMin) parts.push(`Inséré depuis le ${f.dateMin}`);
    if (f.dateMax) parts.push(`Jusqu'au ${f.dateMax}`);
    return parts.length > 0 ? parts.join(" · ") : "Aucun filtre — tout l'onglet";
  }

  /**
   * Point d'entrée générique « <Action> tout le résultat filtré » — UNE
   * fonction pour les cinq onglets de statut (lot du 15/08/2026, « tout
   * sélectionner »), plutôt qu'une paire par verbe : `ONGLET_ACTIONS`
   * (source unique, partagée avec le serveur) dit déjà quelles actions
   * existent sur quel onglet, ce point d'entrée n'a qu'à les brancher sur
   * le même mécanisme motif-d'abord / seuil-ensuite déjà éprouvé pour
   * Valider/Rejeter. Un onglet ne porte jamais deux actions "rejete" à la
   * fois (vérifié sur `ONGLET_ACTIONS`) — le motif demandé reste donc non
   * ambigu même généralisé.
   */
  function demanderActionFiltre(action: ActionOnglet) {
    if (compteFiltre === null) return;
    if (action.statut === "rejete") {
      setDemandeMotifLotFiltre(true);
      return;
    }
    if (compteFiltre > SEUIL_CONFIRMATION) {
      setConfirmationLotFiltre({ verbe: action.statut });
    } else {
      void bulkFiltre(action.statut);
    }
  }

  function onMotifChoisiFiltre(motif: string) {
    setDemandeMotifLotFiltre(false);
    if (compteFiltre !== null && compteFiltre > SEUIL_CONFIRMATION) {
      setConfirmationLotFiltre({ verbe: "rejete", motifRejet: motif });
    } else {
      void bulkFiltre("rejete", motif);
    }
  }

  /** Restaurer tout le résultat filtré — un seul verbe possible, pas de
   *  motif à demander : directement le seuil de confirmation. */
  function demanderRestaurerFiltre() {
    if (compteFiltre === null) return;
    if (compteFiltre > SEUIL_CONFIRMATION) {
      setConfirmationRestaurerFiltre(true);
    } else {
      void restaurerBulkFiltre();
    }
  }

  if (error) {
    return <p className="bg-surface border border-border rounded-xl p-5 text-center text-warn font-bold">{error}</p>;
  }

  if (!deals) {
    return <p className="text-center text-ink-muted py-16">Chargement…</p>;
  }

  const modeSupprimes = onglet === "supprime";
  /** Actions de statut valides sur l'onglet courant — vide pour Supprimés
   *  (traité à part, une seule action possible : restaurer). */
  const actionsOnglet: ActionOnglet[] = modeSupprimes ? [] : ONGLET_ACTIONS[onglet as DealStatut];

  /** « Tout sélectionner » niveau 1 — les lignes actuellement CHARGÉES
   *  (peut dépasser une seule page, via « Charger plus »), jamais le
   *  résultat filtré entier (ça, c'est le niveau 2 ci-dessous, par filtre +
   *  verbe). Toggle : si tout ce qui est visible est déjà coché, décoche
   *  tout ; sinon coche tout ce qui est chargé — jamais une union avec une
   *  sélection précédente, plus simple à lire à l'écran. */
  const tousVisiblesCoches = deals.length > 0 && deals.every((d) => selected.has(d.publicId));
  // Capturé dans une variable locale : `deals` est narrowed non-null à CE
  // point (après le early-return ci-dessus), mais TS ne propage pas ce
  // narrowing dans une fonction imbriquée fermant sur l'état — la capturer
  // ici, une fois, évite un `deals!` répété.
  const dealsCharges = deals;
  function toggleTousVisibles() {
    setSelected(tousVisiblesCoches ? new Set() : new Set(dealsCharges.map((d) => d.publicId)));
  }

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
        {/* Onglet Lots récents (lot du 12/08/2026) — même famille que
            Supprimés : une vue transversale, pas un statut de deal. */}
        <button
          type="button"
          onClick={afficherLots}
          className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${
            vueLots ? "border-accent text-accent" : "border-transparent text-ink-muted"
          }`}
        >
          Lots récents
        </button>
      </div>

      {vueLots && <AdminLots lots={lots} pending={pending} onAnnuler={annulerLot} />}

      {!vueLots && (
        <>
      {/* Filtres — combinables en AND avec l'onglet, filtrés/triés EN BASE
          (voir `urlApi`/`route.ts`, jamais côté client). S'appliquent AU
          CHANGEMENT, comme le tri (corrigé le 15/08/2026 — plus de clic
          « Appliquer » séparé, incohérence avec le tri déjà immédiat).
          Seuls les quatre champs numériques (remise/prix) sont débounced :
          un menu ou une date complète ne déclenche qu'un `onChange`, un
          champ numérique un par chiffre tapé. */}
      <div className="bg-surface-subtle border border-border rounded-xl p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Enseigne
            <select
              value={filtresBrouillon.enseigne}
              onChange={(e) => appliquerFiltreImmediat({ enseigne: e.target.value })}
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
          {/* Distinct de l'enseigne (lot du 15/08/2026) : carrefour.ma et
              bringo.ma partagent la même enseigne "Carrefour" (dédoublonnage
              délibéré, docs/SPIKE-SOURCES.md §12) mais restaient
              indistinguables dans la file — ce filtre dérive le site du
              domaine de `lien`, jamais une colonne (lib/sourcesAdmin.ts). */}
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Source (site)
            <select
              value={filtresBrouillon.source}
              onChange={(e) => appliquerFiltreImmediat({ source: e.target.value })}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Toutes</option>
              {SOURCES_ADMIN.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
              <option value={SOURCE_INCONNUE_SLUG}>Inconnue (inwi, catalogue PDF…)</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Catégorie
            <select
              value={filtresBrouillon.categorie}
              onChange={(e) => appliquerFiltreImmediat({ categorie: e.target.value })}
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
              onChange={(e) => appliquerFiltreImmediat({ dateMin: e.target.value })}
              className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-bold text-ink-muted">
            Jusqu&apos;au
            <input
              type="date"
              value={filtresBrouillon.dateMax}
              onChange={(e) => appliquerFiltreImmediat({ dateMax: e.target.value })}
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
          <Button variant="secondary" size="sm" onClick={reinitialiserFiltres}>
            Réinitialiser
          </Button>
          {/* Indicateur discret — remplace la disparition complète de la
              liste pendant un chargement (corrigé le 15/08/2026). */}
          {chargementListe && <span className="text-xs text-ink-subtle self-center">Mise à jour…</span>}
        </div>
      </div>

      {/* « Tout sélectionner », niveau 1 : les lignes CHARGÉES (lot du
          15/08/2026). Sélection manuelle — agit sur ce qui est COCHÉ,
          jamais un filtre, jamais une liste au-delà de ce qui est déjà à
          l'écran. */}
      {!modeSupprimes && actionsOnglet.length > 0 && deals.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-bold text-ink-muted w-fit cursor-pointer">
            <input type="checkbox" checked={tousVisiblesCoches} onChange={toggleTousVisibles} className="accent-accent" />
            Tout sélectionner (visible) — {deals.length}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {actionsOnglet.map((action) =>
              action.statut === "rejete" ? (
                <Button
                  key={action.statut}
                  variant="danger"
                  size="sm"
                  onClick={() => setDemandeMotifLot(true)}
                  disabled={pending || selected.size === 0}
                >
                  {action.label} la sélection
                </Button>
              ) : (
                <Button
                  key={action.statut}
                  variant={BOUTON_VARIANT[action.variant]}
                  size="sm"
                  onClick={() => void bulk(action.statut)}
                  disabled={pending || selected.size === 0}
                >
                  {action.label} la sélection ({selected.size})
                </Button>
              )
            )}
          </div>
          {demandeMotifLot && selected.size > 0 && (
            <MotifRejet
              libelleConfirmation={`${actionsOnglet.find((a) => a.statut === "rejete")?.label ?? "Rejeter"} les ${selected.size}`}
              pending={pending}
              onAnnuler={() => setDemandeMotifLot(false)}
              onRejeter={(motif) => bulk("rejete", motif)}
            />
          )}
        </div>
      )}

      {/* « Tout sélectionner », niveau 2 : TOUT le résultat filtré (lot du
          12/08/2026, généralisé le 15/08/2026 aux cinq onglets de statut) —
          filtre + verbe, jamais une liste d'identifiants, nombre EXACT issu
          du compte serveur. Séparée visuellement de la sélection manuelle
          ci-dessus : deux portées différentes, jamais confondues à l'écran. */}
      {!modeSupprimes && actionsOnglet.length > 0 && compteFiltre !== null && compteFiltre > 0 && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-ink-muted">
            Traiter TOUT le résultat filtré — {compteFiltre} deal{compteFiltre > 1 ? "s" : ""} ({resumeFiltres(filtres)})
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {actionsOnglet.map((action) => (
              <Button
                key={action.statut}
                variant={BOUTON_VARIANT[action.variant]}
                size="sm"
                onClick={() => demanderActionFiltre(action)}
                disabled={pending}
              >
                {action.label} tout ({compteFiltre})
              </Button>
            ))}
          </div>
          {demandeMotifLotFiltre && (
            <MotifRejet
              libelleConfirmation={`${actionsOnglet.find((a) => a.statut === "rejete")?.label ?? "Rejeter"} les ${compteFiltre}`}
              pending={pending}
              onAnnuler={() => setDemandeMotifLotFiltre(false)}
              onRejeter={onMotifChoisiFiltre}
            />
          )}
          {/* Confirmation nommant le nombre exact ET les filtres — la
              personne doit lire ce qu'elle s'apprête à faire, pas
              seulement combien (au-delà de SEUIL_CONFIRMATION). */}
          {confirmationLotFiltre && (
            <div className="bg-warn-soft border border-warn/40 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-sm font-bold text-ink">
                {actionsOnglet.find((a) => a.statut === confirmationLotFiltre.verbe)?.label ?? confirmationLotFiltre.verbe}{" "}
                précisément {compteFiltre} deal{compteFiltre > 1 ? "s" : ""} ?
              </p>
              <p className="text-xs text-ink-muted">Filtre appliqué : {resumeFiltres(filtres)}</p>
              {confirmationLotFiltre.motifRejet && (
                <p className="text-xs text-ink-muted">Motif : {confirmationLotFiltre.motifRejet}</p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant={confirmationLotFiltre.verbe === "rejete" ? "danger" : "primary"}
                  size="sm"
                  onClick={() => void bulkFiltre(confirmationLotFiltre.verbe, confirmationLotFiltre.motifRejet)}
                  disabled={pending}
                >
                  Confirmer
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmationLotFiltre(null)} disabled={pending}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Onglet Supprimés — « tout sélectionner » à deux niveaux, mais une
          seule action possible (restaurer), pas de choix de verbe ni de
          motif. */}
      {modeSupprimes && deals.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-bold text-ink-muted w-fit cursor-pointer">
            <input type="checkbox" checked={tousVisiblesCoches} onChange={toggleTousVisibles} className="accent-accent" />
            Tout sélectionner (visible) — {deals.length}
          </label>
          <Button variant="primary" size="sm" onClick={() => void restaurerBulk()} disabled={pending || selected.size === 0}>
            Restaurer la sélection ({selected.size})
          </Button>
        </div>
      )}
      {modeSupprimes && compteFiltre !== null && compteFiltre > 0 && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-ink-muted">
            Restaurer TOUT le résultat filtré — {compteFiltre} deal{compteFiltre > 1 ? "s" : ""} ({resumeFiltres(filtres)})
          </p>
          <Button variant="primary" size="sm" onClick={demanderRestaurerFiltre} disabled={pending}>
            Restaurer tout ({compteFiltre})
          </Button>
          {confirmationRestaurerFiltre && (
            <div className="bg-warn-soft border border-warn/40 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-sm font-bold text-ink">
                Restaurer précisément {compteFiltre} deal{compteFiltre > 1 ? "s" : ""} ?
              </p>
              <p className="text-xs text-ink-muted">Filtre appliqué : {resumeFiltres(filtres)}</p>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => void restaurerBulkFiltre()} disabled={pending}>
                  Confirmer
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmationRestaurerFiltre(false)}
                  disabled={pending}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diffusion en masse (lot du 15/08/2026) — réservée à l'onglet
          Publiés, sur la sélection MANUELLE (jamais un filtre : la
          diffusion reste un geste de curation sur des deals précis, comme
          la diffusion unitaire déjà existante par ligne). */}
      {!modeSupprimes && DIFFUSION_ONGLETS.has(onglet as DealStatut) && deals.length > 0 && !panelDiffusion && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPanelDiffusion({ canal: "telegram", publicIds: Array.from(selected) })}
            disabled={pending || selected.size === 0}
          >
            Diffuser la sélection → Telegram ({selected.size})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPanelDiffusion({ canal: "discord", publicIds: Array.from(selected) })}
            disabled={pending || selected.size === 0}
          >
            Diffuser la sélection → Discord ({selected.size})
          </Button>
        </div>
      )}
      {panelDiffusion && (
        <AdminDiffusionLot
          canal={panelDiffusion.canal}
          publicIds={panelDiffusion.publicIds}
          onClose={() => setPanelDiffusion(null)}
        />
      )}

      {deals.length === 0 && (
        <p className="text-center text-ink-muted py-16">
          {modeSupprimes ? "Aucun deal supprimé." : "Rien dans cet onglet."}
        </p>
      )}

      {/* `opacity-60`/`pointer-events-none` pendant `chargementListe`
          (15/08/2026) — la liste précédente reste visible et lisible, elle
          ne disparaît plus derrière « Chargement… » à chaque changement de
          filtre/onglet/tri ; verrouillée le temps du remplacement pour
          éviter un clic sur une ligne sur le point de partir. */}
      <ul
        className={`flex flex-col gap-2 transition-opacity duration-150 motion-reduce:transition-none ${
          chargementListe ? "opacity-60 pointer-events-none" : ""
        }`}
        aria-busy={chargementListe}
      >
        {modeSupprimes
          ? deals.map((deal) => (
              <AdminDealSupprime
                key={deal.publicId}
                deal={deal}
                pending={pending}
                checked={selected.has(deal.publicId)}
                onToggle={() => toggle(deal.publicId)}
                onRestaurer={() => restaurer(deal.publicId)}
              />
            ))
          : deals.map((deal) => (
              <AdminDealItem
                key={deal.publicId}
                deal={deal}
                doublon={deal.doublon}
                actions={actionsOnglet}
                enseignes={enseignes}
                showCheckbox={actionsOnglet.length > 0 || DIFFUSION_ONGLETS.has(onglet as DealStatut)}
                checked={selected.has(deal.publicId)}
                onToggle={() => toggle(deal.publicId)}
                pending={pending}
                onAction={(statut, motifRejet) => updateStatut(deal.publicId, statut, motifRejet)}
                onSaveFields={(fields) => saveDeal(deal.publicId, deal.statut, fields)}
                onFetchImageFromLink={() => fetchImageFromLink(deal.publicId)}
                onUploadImage={(file) => uploadImage(deal.publicId, file)}
                onDiffuser={(canal, mode) => diffuser(deal.publicId, canal, mode)}
                onAnnulerDiffusion={(canal) => annulerDiffusion(deal.publicId, canal)}
                onPartagerWhatsapp={() => partagerWhatsapp(deal.publicId)}
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
        </>
      )}
    </div>
  );
}
