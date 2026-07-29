"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Deal } from "@fidwastafid/schemas";
import { DealCard } from "../components/DealCard.js";
import { construireParamsFeed, fusionnerSansDoublon, messageErreurFeed } from "../lib/feedPagination.js";
import {
  ANCRE_RESULTATS,
  FILTRES_PAR_DEFAUT,
  ecrireFiltresUrl,
  filtresParDefaut,
  lireFiltresUrl,
  nbFiltresActifs,
  normaliserFiltres,
  resumeFiltres,
  type EtatFiltres,
} from "../lib/filtresFeed.js";
import { BarreFiltres } from "./BarreFiltres.js";
import { ColonneFiltres } from "./ColonneFiltres.js";
import { FeuilleFiltres, type SectionFeuille } from "./FeuilleFiltres.js";
import { CONTENEUR } from "./controlesFiltres.js";
import { useTotalResultats } from "./useTotalResultats.js";


/** Délai avant qu'une frappe dans le champ de recherche ne parte au serveur.
 *  La recherche est un filtre serveur depuis le lot 7 : sans ce délai, chaque
 *  caractère déclencherait une requête de liste ET une de compteurs. */
const DELAI_RECHERCHE_MS = 350;

export function Feed({
  initialDeals,
  initialCursor,
  initialFiltres,
  initialTotal,
  hero,
}: {
  initialDeals: Deal[];
  /** Curseur de la page suivante, tel que renvoyé par l'API — `null` si la
   *  première page épuise déjà la liste. */
  initialCursor: string | null;
  /** Filtres lus dans l'URL par le rendu serveur : un feed filtré partagé
   *  s'ouvre déjà filtré, sans passe client. */
  initialFiltres: EtatFiltres;
  initialTotal: number | null;
  /** Rendu AU-DESSUS de la barre de filtres, donc au-dessus du contenu
   *  collant : le hero et ses trois cartes restent en haut de page. */
  hero: React.ReactNode;
}) {
  const [deals, setDeals] = useState(initialDeals);
  /** Curseur courant. Retransmis verbatim à l'API : il encode `asOf` (fige le
   *  classement pendant la navigation), `publicId` (départage les ex æquo) et
   *  la signature des filtres qui l'ont produit. */
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtres, setFiltres] = useState<EtatFiltres>(initialFiltres);
  /** Valeur immédiate du champ de recherche — `filtres.q` ne la reçoit
   *  qu'après le délai de frappe. */
  const [saisie, setSaisie] = useState(initialFiltres.q);
  /** La feuille retient AUSSI son déclencheur : c'est sur lui que le focus
   *  revient à la fermeture, et il n'est plus identifiable une fois la
   *  feuille ouverte (`showModal()` déplace le focus à l'intérieur). */
  const [feuille, setFeuille] = useState<{ section: SectionFeuille; declencheur: HTMLElement | null } | null>(null);
  const resumeRef = useRef<HTMLDivElement>(null);
  const sentinelleRef = useRef<HTMLDivElement>(null);
  /** Barre collée en haut du cadre — pilote la seule ombre, rien d'autre. */
  const [epinglee, setEpinglee] = useState(false);

  const total = useTotalResultats(filtres, initialTotal);

  /**
   * Le bouton « Charger plus » est rendu par le SSR mais ne répond qu'une fois
   * React monté. Sur une connexion mobile lente — l'essentiel de l'audience —
   * cette fenêtre est bien réelle : un clic pendant celle-ci ne fait rien, et
   * le bouton paraît cassé. Il est donc `disabled` jusqu'au montage. Un bouton
   * visiblement inactif est honnête ; un bouton actif qui ne répond pas ne
   * l'est pas.
   *
   * `useSyncExternalStore` plutôt qu'un `setState` dans un effet : c'est la
   * sonde d'hydratation canonique (`false` au rendu serveur, `true` côté
   * client), sans passe de rendu supplémentaire et sans déroger à la règle
   * `react-hooks/set-state-in-effect`. Le store ne change jamais après
   * l'hydratation, d'où un abonnement vide.
   */
  const monte = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  /**
   * Applique un état de filtres ET l'écrit dans l'URL (étape 8) : le retour
   * arrière du navigateur redevient fonctionnel, et un feed filtré se partage
   * tel quel. `pushState` natif plutôt que `router.push` — Next 15 le prend en
   * charge explicitement pour ce cas, et il évite un aller-retour RSC complet
   * alors que la liste est déjà rechargée en fetch ci-dessous.
   */
  const appliquer = useCallback((next: EtatFiltres) => {
    const normalise = normaliserFiltres(next);
    setFiltres(normalise);
    setSaisie(normalise.q);
    window.history.pushState(null, "", `${window.location.pathname}${ecrireFiltresUrl(normalise)}`);
  }, []);

  /** La sentinelle sort du cadre par le haut <=> la barre est collée. */
  useEffect(() => {
    const sentinelle = sentinelleRef.current;
    if (!sentinelle) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setEpinglee(!!entree && !entree.isIntersecting),
      { threshold: 0 }
    );
    observateur.observe(sentinelle);
    return () => observateur.disconnect();
  }, []);

  /** Retour/avance du navigateur : l'URL redevient la source de vérité. */
  useEffect(() => {
    const onPop = () => {
      const depuisUrl = lireFiltresUrl(new URLSearchParams(window.location.search));
      setFiltres(depuisUrl);
      setSaisie(depuisUrl.q);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Frappe -> filtre serveur, après un temps de pause. */
  useEffect(() => {
    const q = saisie.trim();
    if (q === filtres.q) return;
    const timer = setTimeout(() => appliquer({ ...filtres, q }), DELAI_RECHERCHE_MS);
    return () => clearTimeout(timer);
  }, [saisie, filtres, appliquer]);

  /** Le premier rendu a déjà les données SSR (mêmes filtres) — refetch uniquement quand un filtre change réellement. */
  const premierRendu = useRef(true);
  const cleFiltres = construireParamsFeed(filtres).toString();

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }

    // Un changement de filtre en cours de scroll ramène le haut de la liste
    // filtrée sous le bloc collant — sinon l'utilisateur reste au milieu
    // d'une liste qui vient de changer sous ses yeux. La cible est la
    // SENTINELLE et non le compteur : celui-ci vit désormais DANS le bloc
    // collant, donc épinglé en haut du cadre, où `scrollIntoView` n'aurait
    // plus rien à faire défiler.
    sentinelleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let cancelled = false;
    setChargement(true);
    setErreur(null);
    // Le curseur du jeu de filtres PRÉCÉDENT est abandonné immédiatement : il
    // pointe une position dans une liste qui n'existe plus. Le serveur le
    // refuserait de toute façon (signature de filtres embarquée dans le
    // curseur), mais rien ne doit dépendre de cette seconde ligne de défense.
    setCursor(null);

    void (async () => {
      try {
        const res = await fetch(`/api/v1/deals?${cleFiltres}`);
        if (!res.ok) {
          // Jamais un `catch` muet qui laisserait la liste précédente en place
          // en faisant comme si de rien n'était (incident du 26/07/2026) : le
          // statut part dans les logs, l'utilisateur voit un message et peut
          // relancer.
          console.error(`[feed] filtrage échoué — HTTP ${res.status} sur ${cleFiltres}`);
          if (!cancelled) setErreur(messageErreurFeed(res.status));
          return;
        }
        const body = (await res.json()) as { data: Deal[]; nextCursor: string | null };
        if (cancelled) return;
        // Changement de filtre = nouvelle liste, donc nouveau curseur.
        setDeals(body.data);
        setCursor(body.nextCursor);
      } catch (err) {
        console.error("[feed] filtrage échoué — erreur réseau", err);
        if (!cancelled) setErreur(messageErreurFeed());
      } finally {
        if (!cancelled) setChargement(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cleFiltres]);

  /**
   * Page suivante — le curseur est réémis tel quel, jamais reconstruit. Les
   * résultats sont fusionnés en écartant les `publicId` déjà présents : un
   * curseur mal départagé republierait des lignes sans lever d'erreur.
   */
  const chargerPlus = useCallback(async () => {
    if (!cursor || chargement) return;
    setChargement(true);
    setErreur(null);
    const params = construireParamsFeed({ ...filtres, cursor });
    try {
      const res = await fetch(`/api/v1/deals?${params.toString()}`);
      if (!res.ok) {
        console.error(`[feed] page suivante échouée — HTTP ${res.status}`);
        setErreur(messageErreurFeed(res.status));
        return;
      }
      const body = (await res.json()) as { data: Deal[]; nextCursor: string | null };
      setDeals((prev) => fusionnerSansDoublon(prev, body.data));
      setCursor(body.nextCursor);
    } catch (err) {
      console.error("[feed] page suivante échouée — erreur réseau", err);
      setErreur(messageErreurFeed());
    } finally {
      setChargement(false);
    }
  }, [cursor, chargement, filtres]);

  const reinitialiser = useCallback(() => appliquer({ ...FILTRES_PAR_DEFAUT }), [appliquer]);
  /** Stables : la feuille les garde en dépendances d'effet, une identité
   *  changeante rejouerait l'effet (et son retour de focus) à chaque rendu. */
  const fermerFeuille = useCallback(() => setFeuille(null), []);
  const ouvrirFeuille = useCallback(
    (section: SectionFeuille, declencheur: HTMLElement) => setFeuille({ section, declencheur }),
    []
  );

  const nbActifs = nbFiltresActifs(filtres);
  const resume = resumeFiltres(filtres);
  const parDefaut = filtresParDefaut(filtres);


  return (
    <>
      {/*
       * Grille reprise de main À L'IDENTIQUE : colonne latérale de 220px au
       * BORD GAUCHE DE LA FENÊTRE (aucun conteneur centré, aucune largeur
       * maximale qui laisserait des marges vides des deux côtés), contenu
       * dans le reste. Le hero est DANS la colonne de contenu, à droite de la
       * colonne latérale — pas au-dessus d'elle.
       */}
      <div className="md:grid md:grid-cols-[220px_1fr] md:items-start">
        {/*
         * Colonne latérale — panneau `surface` (blanc, pas le plâtre de la
         * page), filet à droite, pleine hauteur, son propre défilement.
         * Traitement visuel et positionnement REPRIS DE MAIN sans
         * modification ; seul le contenu change.
         *
         * Seul écart, imposé : `top-0`/`h-screen` au lieu du `top-[70px]`/
         * `h-[calc(100vh-70px)]` de main. Cet offset compensait un en-tête
         * alors collant ; l'en-tête ne colle plus, et le conserver rouvrirait
         * en haut de la colonne exactement la bande de 70px par laquelle le
         * feed passait — le bug d'origine de ce lot.
         */}
        <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto bg-surface border-r border-border py-5">
          <ColonneFiltres filtres={filtres} onChange={(patch) => appliquer({ ...filtres, ...patch })} />
        </aside>

        <div className={CONTENEUR}>
          {hero}

          {/* Sentinelle d'épinglage : 1px juste au-dessus du bloc. Quand elle
              quitte le haut du cadre, le bloc est collé — c'est le seul moyen
              portable de le savoir (il n'existe pas de sélecteur `:stuck`
              largement disponible). Purement visuel : l'ombre en dépend,
              jamais le collage lui-même. */}
          <div ref={sentinelleRef} aria-hidden="true" className="h-px" />
          {/*
           * UN SEUL bloc collant pour la colonne de contenu : recherche et
           * compteur de résultats, `top-0`, fond OPAQUE. Le tri n'y est plus
           * — il est retourné dans la colonne, où il vit sur main.
           *
           * Le rembourrage supérieur est À L'INTÉRIEUR du bloc (`pt-4`), pas
           * au-dessus : avec un `top-16px` ou une marge externe, il resterait
           * une bande de 16px où le contenu défile visiblement au-dessus du
           * bloc. C'était exactement le bug d'origine, et aucune valeur de
           * décalage n'existe donc dans cette page — ni ici, ni sur la
           * colonne, ni sur l'en-tête (qui ne colle plus du tout).
           *
           * Fond `surface-base` sans transparence ni flou : sur iOS un fond
           * translucide laisse voir le contenu en transit. Filet en bas du
           * bloc, et ombre une fois épinglé seulement.
           */}
          <div
            className={`sticky top-0 z-20 border-b border-border bg-surface-base pt-4 transition-shadow duration-[130ms] motion-reduce:transition-none ${
              epinglee ? "shadow-[0_2px_10px_-4px_rgba(26,24,21,0.30)]" : ""
            }`}
          >
            <BarreFiltres saisie={saisie} nbActifs={nbActifs} onSaisie={setSaisie} onOuvrir={ouvrirFeuille} />

            {/*
             * Compteur de résultats — sans lui, un feed filtré à zéro est
             * indiscernable d'un site en panne. Le nombre vient de
             * `/facettes`, qui applique EXACTEMENT les prédicats de la
             * liste : il ne peut pas annoncer autre chose que ce qui
             * s'affiche. C'est désormais le SEUL nombre de l'interface.
             */}
            <div
              ref={resumeRef}
              id={ANCRE_RESULTATS}
              tabIndex={-1}
              aria-live="polite"
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-3 pt-2.5 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              <span className="font-bold text-ink">
                {total === null ? "…" : total === 1 ? "1 deal" : `${total} deals`}
              </span>
              {resume.length > 0 && <span className="text-ink-muted">{resume.join(" · ")}</span>}
              {!parDefaut && (
                <button
                  type="button"
                  onClick={reinitialiser}
                  className="rounded-[6px] font-bold text-accent underline underline-offset-2 hover:bg-accent-soft focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          <main className="py-4">
            <div className="flex flex-col gap-3">
            {deals.length === 0 && !chargement && !erreur && (
              // État vide EXPLIQUÉ : ce qui a été filtré, et de quoi élargir.
              // Sans filtre actif, le message d'origine est conservé — c'est
              // un feed réellement vide, pas une recherche infructueuse.
              <div className="py-16 text-center">
                {parDefaut ? (
                  <p className="text-ink-muted">Aucun bon plan pour l&apos;instant.</p>
                ) : (
                  <>
                    <p className="text-ink-muted">
                      Aucun deal ne correspond {resume.length > 0 ? `à ${resume.join(" · ")}` : "à cette recherche"}.
                    </p>
                    <button
                      type="button"
                      onClick={reinitialiser}
                      className="mt-3 min-h-11 rounded-full border border-border-strong bg-surface px-5 text-sm font-bold text-ink hover:bg-surface-subtle"
                    >
                      Élargir : voir tous les deals
                    </button>
                  </>
                )}
              </div>
            )}
            {deals.map((deal) => (
              <DealCard key={deal.publicId} deal={deal} />
            ))}
          </div>

          {/* Échec de chargement — message honnête + reprise. Jamais un
              silence : avant ce lot, un rechargement en échec laissait la
              liste précédente à l'écran sans rien signaler. */}
          {erreur && (
            <div
              role="alert"
              className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-warn/40 bg-surface p-4 text-sm"
            >
              <p className="text-center font-bold text-warn">{erreur}</p>
              <button
                type="button"
                onClick={() => void chargerPlus()}
                disabled={chargement}
                className="rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-bold text-ink hover:bg-surface-subtle disabled:opacity-50"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* « Charger plus » — bouton et non scroll infini : le pied de page
              porte les mentions CNDP et loi 09-08, un scroll infini les rendrait
              inatteignables. Disparaît quand l'API ne renvoie plus de curseur. */}
          {cursor && !erreur && (
            <div className="flex justify-center py-6">
              <button
                type="button"
                onClick={() => void chargerPlus()}
                disabled={!monte || chargement}
                aria-busy={chargement}
                className="min-h-11 rounded-full border border-border-strong bg-surface px-6 py-2 text-sm font-bold text-ink hover:bg-surface-subtle disabled:cursor-default disabled:opacity-50"
              >
                {chargement ? "Chargement…" : "Charger plus de deals"}
              </button>
            </div>
          )}

          {/* Fin de liste explicite : sans elle, l'absence de bouton est
              ambiguë (fin réelle ou bouton disparu ?). */}
            {!cursor && !erreur && deals.length > 0 && (
              <p className="py-6 text-center text-xs text-ink-subtle">Tu as vu tous les bons plans du moment.</p>
            )}
          </main>
        </div>
      </div>

      {/* Montée UNIQUEMENT à l'ouverture, et remontée à chaque changement de
          section : le brouillon de la feuille repart donc toujours des
          filtres appliqués, sans effet de réinitialisation à maintenir. */}
      {feuille && (
        <FeuilleFiltres
          key={feuille.section}
          section={feuille.section}
          declencheur={feuille.declencheur}
          filtres={filtres}
          totalInitial={total}
          onFermer={fermerFeuille}
          onAppliquer={appliquer}
        />
      )}
    </>
  );
}
