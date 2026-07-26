"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { VILLES, CATEGORIES, type Deal } from "@fidwastafid/schemas";
import { DealCard } from "../components/DealCard.js";
import { Chip } from "../components/Chip.js";
import { Brand } from "../components/Brand.js";
import { construireParamsFeed, fusionnerSansDoublon, messageErreurFeed } from "../lib/feedPagination.js";

type Type = "tous" | "physique" | "en_ligne";
type Tri = "tendance" | "score" | "recent";

/** "Tendances" en tête (tri par défaut, Phase 5 : rang de gravité type
 *  Dealabs/Hacker News côté API). Les pastilles emoji des libellés sont
 *  retirées (charte Tadelakt : pas d'emoji dans le chrome) — le libellé seul
 *  suffit, ici comme dans le <select> de tri. */
const TRIS: { value: Tri; label: string }[] = [
  { value: "tendance", label: "Tendances" },
  { value: "score", label: "Les plus chauds" },
  { value: "recent", label: "Les plus récents" },
];

/** Bouton vertical de la sidebar — porté depuis .sidebar-btn (index.html racine, v1). */
function sidebarBtnClass(active: boolean): string {
  return `flex items-center gap-2 px-4 py-2 text-xs font-bold text-left border-l-[3px] w-full ${
    active
      ? "text-accent bg-accent-soft border-l-accent"
      : "text-ink-muted border-l-transparent hover:bg-accent-soft hover:text-accent"
  }`;
}

/** Bouton catégorie de la sidebar — porté depuis .cat-btn (index.html racine, v1). */
function catBtnClass(active: boolean): string {
  return `flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left ${
    active ? "bg-accent-soft text-accent border border-accent" : "border border-transparent text-ink-muted hover:bg-accent-soft hover:text-accent"
  }`;
}

/**
 * Bord de dépassement d'un conteneur à défilement horizontal (micro-lot
 * suivi UX filtres, 22/07/2026) : `atStart`/`atEnd` pilotent un fondu vers
 * le fond réel de la barre — désormais plâtre (surface-base, charte Tadelakt),
 * jamais une couleur arbitraire, sinon le fondu se voit comme un bandeau au
 * lieu de se fondre — plutôt qu'un affichage permanent, pour ne pas laisser le
 * fondu de droite visible une fois arrivé en bout de liste (signalerait à tort
 * qu'il reste du contenu). Généralisé depuis le carrousel de chips catégorie
 * (lot précédent, 3f0cc06) pour être réutilisé tel quel par la ligne recherche/
 * ville/type/tri (défaut 1), sans dupliquer la logique. Les deux lignes de la
 * barre partagent le même fond, donc un seul jeu de classes de fondu
 * (FADE_LEFT/FADE_RIGHT) suffit.
 */
/** Le ref est créé et passé par l'appelant (pas retourné par ce hook) :
 *  `react-hooks/refs` (eslint-plugin-react-hooks) interdit d'accéder à une
 *  propriété nommée `ref` — ou toute autre propriété d'un objet qui en
 *  contient une — au moment du rendu, y compris via un objet renvoyé par un
 *  hook custom. En gardant le ref local au composant (`useRef` direct) et
 *  ce hook purement dérivé (état + handler, aucun ref dans sa valeur de
 *  retour), l'objet renvoyé reste lisible en JSX sans déclencher la règle. */
function useScrollEdges(ref: React.RefObject<HTMLElement | null>) {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, [ref]);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  return { atStart, atEnd, onScroll: update };
}

/** Classes statiques et complètes (jamais construites par interpolation de
 *  chaîne : le scanner Tailwind ne détecte que des noms de classe entiers
 *  littéralement présents dans le code source, `from-${x}` ne matcherait
 *  aucune règle générée). Fondu vers le plâtre de la barre (surface-base) —
 *  affordance de défilement, pas un dégradé de marque. */
const FADE_LEFT = "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface-base to-transparent";
const FADE_RIGHT = "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-base to-transparent";

function EdgeFades({ atStart, atEnd }: { atStart: boolean; atEnd: boolean }) {
  return (
    <>
      {!atStart && <div aria-hidden="true" className={FADE_LEFT} />}
      {!atEnd && <div aria-hidden="true" className={FADE_RIGHT} />}
    </>
  );
}

export function Feed({
  initialDeals,
  initialCursor,
  hero,
}: {
  initialDeals: Deal[];
  /** Curseur de la page suivante, tel que renvoyé par l'API — `null` si la
   *  première page épuise déjà la liste. */
  initialCursor: string | null;
  hero: React.ReactNode;
}) {
  const [deals, setDeals] = useState(initialDeals);
  /** Curseur courant. Retransmis verbatim à l'API : il encode `asOf` (fige le
   *  classement pendant la navigation) et `publicId` (départage les ex æquo). */
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ville, setVille] = useState<string>("");
  const [categorie, setCategorie] = useState<string>("");
  const [type, setType] = useState<Type>("tous");
  const [tri, setTri] = useState<Tri>("tendance");
  const [recherche, setRecherche] = useState("");
  const filtresRef = useRef<HTMLDivElement>(null);

  /** Carrousel mobile de chips catégorie (lot UX filtres, 21/07/2026) : la
   *  sidebar (desktop, ≥768px) est l'unique navigation catégories dès qu'elle
   *  est visible, ce carrousel n'existe donc que sous ce seuil (`md:hidden`
   *  ci-dessous) — mais son état (scroll, refs) reste inoffensif à calculer
   *  même caché, pas besoin de le conditionner en JS. */
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const chipsEdges = useScrollEdges(chipsScrollRef);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /** Ligne recherche/ville/type/tri (micro-lot suivi UX filtres, 22/07/2026,
   *  défaut 1) : même mécanisme de bord de dépassement que le carrousel de
   *  chips ci-dessus, réutilisé via useScrollEdges plutôt que dupliqué. */
  const filtresRowRef = useRef<HTMLDivElement>(null);
  const filtresRowEdges = useScrollEdges(filtresRowRef);

  /** À la sélection (sidebar comprise, même état partagé), la chip active du
   *  carrousel mobile est ramenée dans le champ visible — y compris quand la
   *  sélection vient d'ailleurs que du carrousel lui-même. */
  useEffect(() => {
    chipRefs.current[categorie || "__tous__"]?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [categorie]);

  /** Le premier rendu a déjà les données SSR (mêmes filtres par défaut) — refetch uniquement quand un filtre change réellement. */
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }

    // Un changement de filtre en cours de scroll ramène la barre (donc le
    // haut de la liste filtrée) sous le header — comportement standard,
    // sinon l'utilisateur reste bloqué au milieu d'une liste qui vient de
    // changer sous ses yeux. La barre étant sticky, ce scroll s'arrête
    // naturellement à son offset collé (top-[70px]).
    filtresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let cancelled = false;
    setChargement(true);
    setErreur(null);

    void (async () => {
      const params = construireParamsFeed({ tri, ville, categorie, type });
      try {
        const res = await fetch(`/api/v1/deals?${params.toString()}`);
        if (!res.ok) {
          // Jamais un `catch` muet qui laisserait la liste précédente en place
          // en faisant comme si de rien n'était (incident du 26/07/2026) : le
          // statut part dans les logs, l'utilisateur voit un message et peut
          // relancer.
          console.error(`[feed] filtrage échoué — HTTP ${res.status} sur ${params.toString()}`);
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
  }, [ville, categorie, type, tri]);

  /**
   * Page suivante — le curseur est réémis tel quel, jamais reconstruit. Les
   * résultats sont fusionnés en écartant les `publicId` déjà présents : un
   * curseur mal départagé republierait des lignes sans lever d'erreur.
   */
  const chargerPlus = useCallback(async () => {
    if (!cursor || chargement) return;
    setChargement(true);
    setErreur(null);
    const params = construireParamsFeed({ tri, ville, categorie, type, cursor });
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
  }, [cursor, chargement, tri, ville, categorie, type]);

  const visibles = useMemo(() => {
    if (!recherche.trim()) return deals;
    const q = recherche.trim().toLowerCase();
    return deals.filter((d) => d.titre.toLowerCase().includes(q) || (d.enseigneSlug ?? "").toLowerCase().includes(q));
  }, [deals, recherche]);

  return (
    <>
      <div className="md:grid md:grid-cols-[220px_1fr] md:items-start">
        {/* Sidebar desktop — cachée en mobile (la barre de filtres collante
            ci-dessous reste seule responsable du tri/filtrage) — parité v1
            (.sidebar). Sticky indépendante de la barre de filtres : chacune
            vit dans sa propre colonne de la grille, aucun chevauchement. */}
        <aside className="hidden md:flex md:flex-col md:sticky md:top-[70px] md:h-[calc(100vh-70px)] md:overflow-y-auto bg-surface border-r border-border py-5">
          <div className="text-center px-4 pb-4 mb-3 border-b border-border">
            <Brand forme="mark" hauteur={72} className="mx-auto mb-2" alt="" />
            <p className="text-[10px] text-ink-muted font-semibold">Bons plans marocains</p>
          </div>

          <Link
            href="/concept"
            className="mx-3 mb-1 rounded-[10px] border border-accent-line bg-surface text-left text-xs font-extrabold px-3.5 py-2.5 text-accent hover:bg-accent-soft hover:border-accent transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            Le concept Fidwastafid
          </Link>

          <p className="px-4 pt-2 pb-1 text-[9px] font-extrabold tracking-wider uppercase text-ink-subtle">Trier par</p>
          {TRIS.map((t) => (
            <button key={t.value} type="button" onClick={() => setTri(t.value)} className={sidebarBtnClass(tri === t.value)}>
              {t.label}
            </button>
          ))}

          <p className="px-4 pt-3 pb-1 text-[9px] font-extrabold tracking-wider uppercase text-ink-subtle">Catégories</p>
          <div className="px-4 flex flex-col gap-0.5">
            <button type="button" onClick={() => setCategorie("")} className={catBtnClass(categorie === "")}>
              Tous les deals
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategorie(c)} className={catBtnClass(categorie === c)}>
                {c}
              </button>
            ))}
          </div>

          <Link
            href="/soumettre"
            className="mx-3 mt-4 rounded-2xl border border-accent-soft bg-accent-soft text-center p-3.5 hover:bg-[#dbe7df] transition-colors duration-[130ms] motion-reduce:transition-none"
          >
            <span dir="rtl" className="font-arabic block text-lg font-bold text-accent">
              فيد و ستافيد
            </span>
            <span className="block text-[10px] text-accent/80 mt-0.5">Partage un bon plan →</span>
          </Link>
        </aside>

        <main className="max-w-2xl md:max-w-none mx-auto md:mx-0 p-4">
          {hero}

          {/*
           * Barre de filtres collante — chips catégorie + recherche/ville/
           * type/tri, fusion de ce qui vivait avant en deux blocs séparés
           * (chips desktop-only + barre de recherche pleine largeur hors
           * grille). `top-[70px]` : même offset que la sidebar desktop
           * (celle-ci l'utilise déjà pour se coller sous le header sticky,
           * cf. <aside> ci-dessus) — active ici sur mobile ET desktop,
           * contrairement à la sidebar qui reste desktop-only.
           *
           * Deux lignes à défilement horizontal (overflow-x-auto,
           * flex-nowrap) plutôt que flex-wrap : borne la hauteur à deux
           * lignes fixes quel que soit le nombre de contrôles ou la largeur
           * d'écran, au lieu de laisser un retour à la ligne imprévisible
           * grandir la barre collée. `position: sticky` ne provoque par
           * nature aucun saut de layout à l'accrochage (contrairement à un
           * `position: fixed` qui exigerait un espaceur).
           *
           * Fond plâtre (surface-base, charte Tadelakt : la barre est posée
           * sur le fond de page, pas sur blanc) + filet inférieur, SANS ombre :
           * elle se distingue des cartes blanches qui défilent dessous par le
           * seul contraste plâtre/blanc, et de la page derrière par le filet.
           * `z-[5]` : sous le header (`z-10`, ne doit jamais être recouvert)
           * et le menu compte du header (`z-20`), au-dessus des cartes
           * (z-auto).
           *
           * Catégorie : carrousel de chips en mobile UNIQUEMENT (`md:hidden`
           * ci-dessous, lot UX filtres du 21/07/2026) — la sidebar (≥768px)
           * est la seule navigation catégories dès qu'elle est visible ;
           * plus de <select> catégorie dupliqué. Desktop : pas de pilules
           * dans cette barre, elle ne garde que recherche/ville/type/tri.
           */}
          <div
            ref={filtresRef}
            className="sticky top-[70px] z-[5] -mx-4 px-4 bg-surface-base border-b border-border pt-3 pb-2 mb-3 flex flex-col gap-2"
          >
            {/* Carrousel catégories — mobile uniquement (<768px). Scrollbar
                masquée (.no-scrollbar, globals.css) + défilement tactile
                inertiel natif (-webkit-overflow-scrolling) ; fondu de bord
                gauche/droit conditionné à la position de scroll réelle
                (chipsEdges.atStart/atEnd, calculés par onScroll) plutôt
                qu'affiché en permanence — sinon le fondu de droite resterait
                visible même une fois arrivé en bout de liste, signalant à
                tort qu'il reste du contenu. */}
            <div className="relative md:hidden">
              <div
                ref={chipsScrollRef}
                onScroll={chipsEdges.onScroll}
                className="no-scrollbar flex items-center gap-2 overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch]"
              >
                <Chip
                  ref={(el) => {
                    chipRefs.current.__tous__ = el;
                  }}
                  active={categorie === ""}
                  onClick={() => setCategorie("")}
                  className="shrink-0"
                >
                  Tous
                </Chip>
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    ref={(el) => {
                      chipRefs.current[c] = el;
                    }}
                    active={categorie === c}
                    onClick={() => setCategorie(c)}
                    className="shrink-0"
                  >
                    {c}
                  </Chip>
                ))}
              </div>
              <EdgeFades atStart={chipsEdges.atStart} atEnd={chipsEdges.atEnd} />
            </div>

            {/* Recherche/ville/type/tri — même traitement de bord de
                dépassement que le carrousel ci-dessus (micro-lot suivi UX
                filtres, 22/07/2026, défaut 1) : cette ligne défilait avec
                une scrollbar native visible, seul le carrousel de chips
                avait été corrigé au lot précédent. */}
            <div className="relative">
              <div
                ref={filtresRowRef}
                onScroll={filtresRowEdges.onScroll}
                className="no-scrollbar flex items-center gap-2 overflow-x-auto text-sm [-webkit-overflow-scrolling:touch]"
              >
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un deal, une enseigne..."
                  className="shrink-0 w-44 md:flex-1 md:w-auto border border-border-strong bg-surface rounded-full px-4 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(47,107,87,0.13)] transition-[border-color,box-shadow] duration-[130ms] motion-reduce:transition-none"
                />
                <select
                  value={ville}
                  onChange={(e) => setVille(e.target.value)}
                  className="shrink-0 border border-border-strong bg-surface rounded-full px-3 py-1 font-bold text-xs text-ink-muted focus:border-accent focus:outline-none"
                >
                  <option value="">Toutes les villes</option>
                  {VILLES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="shrink-0 flex gap-1">
                  {(
                    [
                      { value: "tous", label: "Tous" },
                      { value: "physique", label: "Physique" },
                      { value: "en_ligne", label: "En ligne" },
                    ] as const
                  ).map((t) => (
                    <Chip key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
                <select
                  value={tri}
                  onChange={(e) => setTri(e.target.value as Tri)}
                  className="shrink-0 border border-border-strong bg-surface rounded-full px-3 py-1 font-bold text-xs text-ink-muted focus:border-accent focus:outline-none md:ml-auto"
                >
                  {TRIS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <EdgeFades atStart={filtresRowEdges.atStart} atEnd={filtresRowEdges.atEnd} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {visibles.length === 0 && !chargement && !erreur && (
              <p className="text-center text-ink-muted py-16">Aucun bon plan pour l&apos;instant.</p>
            )}
            {visibles.map((deal) => (
              <DealCard key={deal.publicId} deal={deal} />
            ))}
          </div>

          {/* Échec de chargement — message honnête + reprise. Jamais un
              silence : avant ce lot, un rechargement en échec laissait la
              liste précédente à l'écran sans rien signaler. */}
          {erreur && (
            <div
              role="alert"
              className="mt-4 bg-surface border border-warn/40 rounded-xl p-4 flex flex-col items-center gap-2 text-sm"
            >
              <p className="text-warn font-bold text-center">{erreur}</p>
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
                disabled={chargement}
                aria-busy={chargement}
                className="min-h-11 rounded-full border border-border-strong bg-surface px-6 py-2 text-sm font-bold text-ink hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-default"
              >
                {chargement ? "Chargement…" : "Charger plus de deals"}
              </button>
            </div>
          )}

          {/* Fin de liste explicite : sans elle, l'absence de bouton est
              ambiguë (fin réelle ou bouton disparu ?). */}
          {!cursor && !erreur && visibles.length > 0 && (
            <p className="text-center text-ink-subtle text-xs py-6">Tu as vu tous les bons plans du moment.</p>
          )}
        </main>
      </div>
    </>
  );
}
