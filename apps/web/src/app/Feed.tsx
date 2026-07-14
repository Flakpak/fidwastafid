"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VILLES, CATEGORIES, type Deal } from "@fidwastafid/schemas";
import { DealCard } from "../components/DealCard.js";

type Type = "tous" | "physique" | "en_ligne";
type Tri = "score" | "recent";

const TRIS: { value: Tri; label: string }[] = [
  { value: "score", label: "Les plus chauds" },
  { value: "recent", label: "Les plus récents" },
];

export function Feed({ initialDeals }: { initialDeals: Deal[] }) {
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

      <div className="bg-white border-b border-bordure px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
        <select value={ville} onChange={(e) => setVille(e.target.value)} className="border border-bordure rounded-full px-3 py-1 font-bold text-xs">
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

      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-3">
        {visibles.length === 0 && <p className="text-center text-muted py-16">Aucun bon plan pour l&apos;instant.</p>}
        {visibles.map((deal) => (
          <DealCard key={deal.publicId} deal={deal} />
        ))}
      </main>
    </>
  );
}
