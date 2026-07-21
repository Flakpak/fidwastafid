"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { VILLES, CATEGORIES, type Deal } from "@fidwastafid/schemas";
import { DealCard } from "../components/DealCard.js";
import { Seal } from "../components/Seal.js";
import { categorieIcon } from "../lib/format.js";

type Type = "tous" | "physique" | "en_ligne";
type Tri = "tendance" | "score" | "recent";

/** "Tendances" en tête (tri par défaut, Phase 5 : rang de gravité type
 *  Dealabs/Hacker News côté API) — 🔥 lui revient (icône "chaud/tendance"
 *  de la charte), "Les plus chauds" (score brut) passe à 👍 pour ne pas
 *  dupliquer l'icône entre les deux tris. */
const TRIS: { value: Tri; label: string; emoji: string }[] = [
  { value: "tendance", label: "Tendances", emoji: "🔥" },
  { value: "score", label: "Les plus chauds", emoji: "👍" },
  { value: "recent", label: "Les plus récents", emoji: "⚡" },
];

/** Bouton vertical de la sidebar — porté depuis .sidebar-btn (index.html racine, v1). */
function sidebarBtnClass(active: boolean): string {
  return `flex items-center gap-2 px-4 py-2 text-xs font-bold text-left border-l-[3px] w-full ${
    active ? "text-rouge bg-[#fff5f5] border-l-rouge" : "text-muted border-l-transparent hover:bg-creme hover:text-texte"
  }`;
}

/** Bouton catégorie de la sidebar — porté depuis .cat-btn (index.html racine, v1). */
function catBtnClass(active: boolean): string {
  return `flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-left ${
    active ? "bg-[#fff0f0] text-rouge" : "text-muted hover:bg-[#fff0f0] hover:text-rouge"
  }`;
}

/** Chip catégorie du carrousel mobile — porté depuis .filter-pill (index.html
 *  racine, v1). `min-h-[40px]` : cible tactile ≥40px (lot UX filtres du
 *  21/07/2026), le padding vertical seul (py-1.5) ne suffisait pas. */
function chipClass(active: boolean): string {
  return `flex items-center min-h-[40px] rounded-full px-3.5 text-xs font-bold border ${
    active ? "bg-rouge text-white border-rouge" : "bg-white text-muted border-bordure hover:border-rouge hover:text-rouge"
  }`;
}

export function Feed({ initialDeals, hero }: { initialDeals: Deal[]; hero: React.ReactNode }) {
  const [deals, setDeals] = useState(initialDeals);
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
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [chipsAtStart, setChipsAtStart] = useState(true);
  const [chipsAtEnd, setChipsAtEnd] = useState(true);

  function updateChipsEdges() {
    const el = chipsScrollRef.current;
    if (!el) return;
    setChipsAtStart(el.scrollLeft <= 0);
    setChipsAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  useEffect(() => {
    updateChipsEdges();
    window.addEventListener("resize", updateChipsEdges);
    return () => window.removeEventListener("resize", updateChipsEdges);
  }, []);

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

    const params = new URLSearchParams({ limit: "24", tri });
    if (ville) params.set("ville", ville);
    if (categorie) params.set("categorie", categorie);
    if (type !== "tous") params.set("type", type);

    let cancelled = false;
    fetch(`/api/v1/deals?${params.toString()}`)
      .then((res) => res.json())
      .then((body: { data: Deal[] }) => {
        if (!cancelled) setDeals(body.data);
      });
    return () => {
      cancelled = true;
    };
  }, [ville, categorie, type, tri]);

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
        <aside className="hidden md:flex md:flex-col md:sticky md:top-[70px] md:h-[calc(100vh-70px)] md:overflow-y-auto bg-white border-r border-bordure py-5">
          <div className="text-center px-4 pb-4 mb-3 border-b border-bordure">
            <Seal className="w-20 h-20 mx-auto mb-2" />
            <p className="text-[10px] text-muted font-semibold">Bons plans marocains 🇲🇦</p>
          </div>

          <Link
            href="/concept"
            className="mx-3 mb-1 rounded-[10px] border border-[#e8dcc8] bg-gradient-to-br from-[#fff8f5] to-white text-left text-xs font-extrabold px-3.5 py-2.5 text-texte"
          >
            💡 Le concept Fidwastafid
          </Link>

          <p className="px-4 pt-2 pb-1 text-[9px] font-extrabold tracking-wider uppercase text-[#ccc]">Trier par</p>
          {TRIS.map((t) => (
            <button key={t.value} type="button" onClick={() => setTri(t.value)} className={sidebarBtnClass(tri === t.value)}>
              {t.emoji} {t.label}
            </button>
          ))}

          <p className="px-4 pt-3 pb-1 text-[9px] font-extrabold tracking-wider uppercase text-[#ccc]">Catégories</p>
          <div className="px-4 flex flex-col gap-0.5">
            <button type="button" onClick={() => setCategorie("")} className={catBtnClass(categorie === "")}>
              🔥 Tous les deals
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategorie(c)} className={catBtnClass(categorie === c)}>
                {categorieIcon(c)} {c}
              </button>
            ))}
          </div>

          <Link
            href="/soumettre"
            className="mx-3 mt-4 rounded-2xl bg-gradient-to-br from-rouge to-orange text-white text-center p-3.5"
          >
            <span dir="rtl" className="font-arabic block text-lg font-bold">
              فيد و ستافيد
            </span>
            <span className="block text-[10px] opacity-80 mt-0.5">Partage un bon plan →</span>
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
           * Fond opaque (bg-creme, même teinte que la page) + ombre légère +
           * filet inférieur : sépare visuellement les cartes qui défilent
           * dessous. `z-[5]` : sous le header (`z-10`, ne doit jamais être
           * recouvert) et le menu compte du header (`z-20`), au-dessus des
           * cartes (z-auto).
           *
           * Catégorie : carrousel de chips en mobile UNIQUEMENT (`md:hidden`
           * ci-dessous, lot UX filtres du 21/07/2026) — la sidebar (≥768px)
           * est la seule navigation catégories dès qu'elle est visible ;
           * plus de <select> catégorie dupliqué. Desktop : pas de pilules
           * dans cette barre, elle ne garde que recherche/ville/type/tri.
           */}
          <div
            ref={filtresRef}
            className="sticky top-[70px] z-[5] -mx-4 px-4 bg-creme border-b border-bordure shadow-sm pt-3 pb-2 mb-3 flex flex-col gap-2"
          >
            {/* Carrousel catégories — mobile uniquement (<768px). Scrollbar
                masquée (.no-scrollbar, globals.css) + défilement tactile
                inertiel natif (-webkit-overflow-scrolling) ; fondu de bord
                gauche/droit conditionné à la position de scroll réelle
                (chipsAtStart/chipsAtEnd, calculés par onScroll) plutôt
                qu'affiché en permanence — sinon le fondu de droite resterait
                visible même une fois arrivé en bout de liste, signalant à
                tort qu'il reste du contenu. */}
            <div className="relative md:hidden">
              <div
                ref={chipsScrollRef}
                onScroll={updateChipsEdges}
                className="no-scrollbar flex items-center gap-2 overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch]"
              >
                <button
                  type="button"
                  ref={(el) => {
                    chipRefs.current.__tous__ = el;
                  }}
                  onClick={() => setCategorie("")}
                  className={`shrink-0 ${chipClass(categorie === "")}`}
                >
                  Tous
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    ref={(el) => {
                      chipRefs.current[c] = el;
                    }}
                    onClick={() => setCategorie(c)}
                    className={`shrink-0 ${chipClass(categorie === c)}`}
                  >
                    {categorieIcon(c)} {c}
                  </button>
                ))}
              </div>
              {!chipsAtStart && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-creme to-transparent"
                />
              )}
              {!chipsAtEnd && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-creme to-transparent"
                />
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto text-sm">
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un deal, une enseigne..."
                className="shrink-0 w-44 md:flex-1 md:w-auto border border-bordure rounded-full px-4 py-1.5 text-sm"
              />
              <select
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                className="shrink-0 border border-bordure rounded-full px-3 py-1 font-bold text-xs"
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
                    { value: "physique", label: "🏪 Physique" },
                    { value: "en_ligne", label: "🌐 En ligne" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`rounded-full px-3 py-1 font-bold text-xs ${
                      type === t.value ? "bg-rouge text-white" : "bg-white text-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select
                value={tri}
                onChange={(e) => setTri(e.target.value as Tri)}
                className="shrink-0 border border-bordure rounded-full px-3 py-1 font-bold text-xs md:ml-auto"
              >
                {TRIS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {visibles.length === 0 && <p className="text-center text-muted py-16">Aucun bon plan pour l&apos;instant.</p>}
            {visibles.map((deal) => (
              <DealCard key={deal.publicId} deal={deal} />
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
