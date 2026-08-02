"use client";

import {
  DIMENSIONS,
  OU_ACHETER,
  RAISON_VILLE_SANS_OBJET,
  TRIS,
  villeSansObjet,
  type EtatFiltres,
  type TriFeed,
  type TypeAchat,
} from "../lib/filtresFeed.js";
import Link from "next/link";
import { Brand } from "../components/Brand.js";
import { CADRE, NEUTRE } from "./controlesFiltres.js";

/**
 * Colonne latérale — REPRISE DE MAIN À L'IDENTIQUE pour tout ce qui est
 * traitement visuel et positionnement (panneau `surface`, filet à droite,
 * collée au bord gauche de la fenêtre, pleine hauteur). Le lot 7 l'avait
 * supprimée, puis redessinée : les deux étaient des erreurs. Seul son
 * CONTENU change ici.
 *
 * Ce qu'elle gagne : les deux filtres qui vivaient dans la rangée
 * horizontale — Ville et Où acheter. Cette rangée ne tenait pas quatre
 * dimensions (libellés tronqués, espacements inégaux) ; la colonne, si.
 *
 * Ce qu'elle garde de main, au même endroit et dans le même style : « Trier
 * par » et « Catégories ». Le tri reste ici — c'est sa place sur main, et le
 * remonter au-dessus du feed était une complication inutile.
 *
 * Ce qu'elle ne reprend PAS : le bloc de marque et le CTA arabe. Retrait
 * acté (docs/IDEES.md, 2026-07-28) — le CTA et le lien concept vivent dans la
 * ligne de clôture du hero, qui existe aussi en mobile.
 */

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

const TITRE = "px-4 pt-3 pb-1 text-[9px] font-extrabold tracking-wider uppercase text-ink-subtle";

export function ColonneFiltres({
  filtres,
  nbActifs,
  onChange,
  onReinitialiser,
}: {
  filtres: EtatFiltres;
  nbActifs: number;
  onChange: (patch: Partial<EtatFiltres>) => void;
  onReinitialiser: () => void;
}) {
  const villeInactive = villeSansObjet(filtres);

  return (
    <>
      {/* ── Bloc de marque et lien concept — RÉTABLIS à l'identique de main
             (28/07/2026). Ils avaient été retirés, puis le retrait consigné
             dans IDEES.md ; la revue visuelle a tranché l'inverse. La colonne
             les reprend donc à leur place d'origine, en tête. ── */}
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

      {/* ── Trier par — inchangé depuis main ── */}
      <p className={`${TITRE} pt-2`}>Trier par</p>
      {TRIS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange({ tri: t.value as TriFeed })}
          className={sidebarBtnClass(filtres.tri === t.value)}
        >
          {t.label}
        </button>
      ))}

      {/* ── Catégories — inchangé depuis main. Aucune n'est grisée : sept
             entrées en gris pâle sans compteur pour les expliquer donnaient
             une colonne à moitié morte. Une catégorie sans deal se choisit
             donc normalement, et l'état vide du feed dit ce qui s'est passé
             et propose d'élargir — plus honnête qu'un grisé muet. ── */}
      <p className={TITRE}>Catégories</p>
      <div className="px-4 flex flex-col gap-0.5">
        <button type="button" onClick={() => onChange({ categorie: "" })} className={catBtnClass(filtres.categorie === "")}>
          {DIMENSIONS.categorie.neutre}
        </button>
        {DIMENSIONS.categorie.valeurs.map((c) => (
          <button key={c} type="button" onClick={() => onChange({ categorie: c })} className={catBtnClass(filtres.categorie === c)}>
            {c}
          </button>
        ))}
      </div>

      {/* ── Ville — menu déroulant : neuf valeurs aujourd'hui, et c'est la
             dimension qui s'allongera si le SEO local se développe. ── */}
      <p className={TITRE}>{DIMENSIONS.ville.nom}</p>
      <div className="px-4">
        <select
          value={filtres.ville}
          disabled={villeInactive}
          title={villeInactive ? RAISON_VILLE_SANS_OBJET : undefined}
          onChange={(e) => onChange({ ville: e.target.value })}
          aria-label={DIMENSIONS.ville.nom}
          className={`${CADRE} ${filtres.ville ? "border-accent bg-accent-soft font-bold text-accent" : NEUTRE} h-9 w-full px-2 text-[11px] font-bold focus:border-accent focus:outline-none disabled:cursor-default disabled:opacity-50`}
        >
          <option value="">{DIMENSIONS.ville.neutre}</option>
          {DIMENSIONS.ville.valeurs.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {villeInactive && <p className="pt-1.5 text-[10px] leading-snug text-ink-muted">{RAISON_VILLE_SANS_OBJET}</p>}
      </div>

      {/* ── Où acheter — trois options exclusives, même traitement vertical
             que « Trier par ». ── */}
      <p className={TITRE}>Où acheter</p>
      {OU_ACHETER.map((o) => (
        <button
          key={o.value || "partout"}
          type="button"
          onClick={() => onChange({ type: o.value as TypeAchat })}
          className={sidebarBtnClass(filtres.type === o.value)}
        >
          {o.label}
        </button>
      ))}

      {/* ── Réinitialisation — DÉPLACÉE ICI (28/07/2026) : elle vivait sur la
             rangée du compteur de résultats, retirée du bloc collant. Sans
             elle, effacer trois dimensions demandait trois gestes. N'apparaît
             que s'il y a quelque chose à effacer — un lien permanent sur une
             vue non filtrée annonce un état qui n'existe pas. ── */}
      {nbActifs > 0 && (
        <button
          type="button"
          onClick={onReinitialiser}
          className="mx-4 mt-3 self-start rounded-[6px] text-left text-[11px] font-bold text-accent underline underline-offset-4 hover:text-accent-hi focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Réinitialiser les filtres
        </button>
      )}

      {/* ── CTA de soumission — rétabli en pied de colonne, à l'identique de
             main. Il reste AUSSI dans la ligne de clôture du hero, mais celle-ci
             est désormais réservée au mobile (`md:hidden`), où la colonne
             n'existe pas : les deux ne coexistent jamais à l'écran. ── */}
      <Link
        href="/soumettre"
        className="mx-3 mt-4 rounded-2xl border border-accent-soft bg-accent-soft text-center p-3.5 hover:bg-[#dbe7df] transition-colors duration-[130ms] motion-reduce:transition-none"
      >
        <span dir="rtl" className="font-arabic block text-lg font-bold text-accent">
          فيد و ستافيد
        </span>
        <span className="block text-[10px] text-accent/80 mt-0.5">Partage un bon plan →</span>
      </Link>
    </>
  );
}
