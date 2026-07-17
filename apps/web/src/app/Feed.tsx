"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { VILLES, CATEGORIES, type Deal } from "@fidwastafid/schemas";
import { DealCard } from "../components/DealCard.js";
import { Seal } from "../components/Seal.js";
import { categorieIcon } from "../lib/format.js";

type Type = "tous" | "physique" | "en_ligne";
type Tri = "score" | "recent";

const TRIS: { value: Tri; label: string; emoji: string }[] = [
  { value: "score", label: "Les plus chauds", emoji: "🔥" },
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

/** Pill catégorie au-dessus du feed — porté depuis .filter-pill (index.html racine, v1). */
function chipClass(active: boolean): string {
  return `rounded-full px-3.5 py-1.5 text-xs font-bold border ${
    active ? "bg-rouge text-white border-rouge" : "bg-white text-muted border-bordure hover:border-rouge hover:text-rouge"
  }`;
}

export function Feed({ initialDeals, hero }: { initialDeals: Deal[]; hero: React.ReactNode }) {
  const [deals, setDeals] = useState(initialDeals);
  const [ville, setVille] = useState<string>("");
  const [categorie, setCategorie] = useState<string>("");
  const [type, setType] = useState<Type>("tous");
  const [tri, setTri] = useState<Tri>("score");
  const [recherche, setRecherche] = useState("");

  /** Le premier rendu a déjà les données SSR (mêmes filtres par défaut) — refetch uniquement quand un filtre change réellement. */
  const premierRendu = useRef(true);

  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }

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
      <div className="bg-white border-b border-bordure px-4 py-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un deal, une enseigne..."
          className="w-full max-w-2xl mx-auto block border border-bordure rounded-full px-4 py-1.5 text-sm"
        />
      </div>

      <div className="md:grid md:grid-cols-[220px_1fr] md:items-start">
        {/* Sidebar desktop — cachée en mobile (les selects ci-dessous restent
            seuls responsables du tri/filtrage) — parité v1 (.sidebar). */}
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

          <div className="hidden md:flex items-center gap-2 mb-3 flex-wrap">
            <button type="button" onClick={() => setCategorie("")} className={chipClass(categorie === "")}>
              Tous
            </button>
            {CATEGORIES.slice(0, 4).map((c) => (
              <button key={c} type="button" onClick={() => setCategorie(c)} className={chipClass(categorie === c)}>
                {categorieIcon(c)} {c}
              </button>
            ))}
          </div>

          <div className="bg-white border border-bordure rounded-lg px-4 py-2 flex flex-wrap items-center gap-2 text-sm mb-3">
            <select
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="border border-bordure rounded-full px-3 py-1 font-bold text-xs"
            >
              <option value="">Toutes les villes</option>
              {VILLES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
              className="border border-bordure rounded-full px-3 py-1 font-bold text-xs"
            >
              <option value="">Toutes catégories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
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
                    type === t.value ? "bg-rouge text-white" : "bg-creme text-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              className="border border-bordure rounded-full px-3 py-1 font-bold text-xs ml-auto"
            >
              {TRIS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
