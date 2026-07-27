"use client";

import {
  RAISON_VILLE_SANS_OBJET,
  TRIS,
  etiquetteSelecteur,
  villeSansObjet,
  type EtatFiltres,
  type TriFeed,
  type TypeAchat,
} from "../lib/filtresFeed.js";
import {
  CADRE,
  CONTENEUR,
  ChampRecherche,
  IconeReglages,
  NEUTRE,
  SegmenteOuAcheter,
  SelecteurDimension,
} from "./controlesFiltres.js";
import type { SectionFeuille } from "./FeuilleFiltres.js";

/**
 * Barre de filtres — rangées 2 et 3 du bloc collant (la rangée 1 est
 * l'en-tête du site, rendu par le même conteneur collant).
 *
 * Aucun défilement horizontal, à aucune largeur : les contrôles qui ne
 * tiennent pas en mobile ne sont pas poussés hors écran, ils vivent dans la
 * feuille. Les deux rangées ont une hauteur fixe (h-11, cible tactile ≥44px)
 * — la hauteur du bloc collant ne dépend donc ni du nombre de contrôles ni de
 * la longueur des valeurs choisies.
 */
export function BarreFiltres({
  filtres,
  saisie,
  nbActifs,
  onSaisie,
  onChange,
  onOuvrir,
}: {
  filtres: EtatFiltres;
  saisie: string;
  nbActifs: number;
  onSaisie: (v: string) => void;
  onChange: (patch: Partial<EtatFiltres>) => void;
  /** Le déclencheur voyage avec la section : c'est sur LUI que le focus
   *  revient à la fermeture, et il n'est pas déductible après coup
   *  (`showModal()` a déjà déplacé le focus dans la feuille). */
  onOuvrir: (section: SectionFeuille, declencheur: HTMLElement) => void;
}) {
  const villeInactive = villeSansObjet(filtres);
  const selecteurVille = (
    <SelecteurDimension
      etiquette={etiquetteSelecteur("ville", filtres.ville)}
      actif={!!filtres.ville}
      desactive={villeInactive}
      titre={villeInactive ? RAISON_VILLE_SANS_OBJET : undefined}
      onClick={(el) => onOuvrir("ville", el)}
    />
  );
  const selecteurCategorie = (
    <SelecteurDimension
      etiquette={etiquetteSelecteur("categorie", filtres.categorie)}
      actif={!!filtres.categorie}
      onClick={(el) => onOuvrir("categorie", el)}
    />
  );

  return (
    <div className={`${CONTENEUR} flex flex-col gap-2 py-2`}>
      <>
        {/* ── Compact (jusqu'à lg) — rangée 2 : recherche pleine largeur + réglages ── */}
        <div className="flex h-11 gap-2 lg:hidden">
          <ChampRecherche valeur={saisie} onChange={onSaisie} className="h-full flex-1" />
          <button
            type="button"
            onClick={(e) => onOuvrir("reglages", e.currentTarget)}
            aria-haspopup="dialog"
            aria-label={nbActifs > 0 ? `Filtres (${nbActifs} actifs)` : "Filtres"}
            className={`${CADRE} ${nbActifs > 0 ? "border-accent bg-accent-soft text-accent" : NEUTRE} relative flex h-full w-11 shrink-0 items-center justify-center`}
          >
            <IconeReglages className="h-5 w-5" />
            {/* Pastille MASQUÉE à zéro : un compteur qui affiche « 0 » dit
                qu'il se passe quelque chose là où il ne se passe rien. */}
            {nbActifs > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-surface bg-accent px-1 text-[11px] font-bold tabular-nums text-white"
              >
                {nbActifs}
              </span>
            )}
          </button>
        </div>

        {/* ── Compact — rangée 3 : deux sélecteurs à parts égales ──
            `grid-cols-2` + `min-w-0` (dans SelecteurDimension) : les deux
            moitiés restent strictement égales quelle que soit la longueur des
            valeurs, qui sont coupées aux points de suspension. */}
        <div className="grid h-11 grid-cols-2 gap-2 lg:hidden">
          {selecteurCategorie}
          {selecteurVille}
        </div>

        {/* ── Desktop (≥ lg) — une seule rangée, plus aucune puce défilante ──
            « Trier par » est séparé à droite par un filet : ce n'est pas un
            filtre, il ne retire aucun deal.

            Seule la recherche est élastique (`flex-1 min-w-0`) ; tout le
            reste est `shrink-0` à largeur intrinsèque. C'est elle, et elle
            seule, qui absorbe la largeur restante — aucun contrôle ne peut
            donc être poussé hors écran. */}
        <div className="hidden h-10 items-center gap-2 lg:flex">
          <ChampRecherche valeur={saisie} onChange={onSaisie} className="h-full min-w-0 flex-1" />
          <div className="h-full w-[9.5rem] shrink-0">{selecteurCategorie}</div>
          <div className="h-full w-32 shrink-0">{selecteurVille}</div>
          <SegmenteOuAcheter
            name="barre-ou-acheter"
            valeur={filtres.type}
            onChange={(t: TypeAchat) => onChange({ type: t })}
            className="h-full shrink-0"
          />
          <div className="flex h-full shrink-0 items-center gap-2 border-l border-border pl-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">Trier par</span>
            <select
              value={filtres.tri}
              onChange={(e) => onChange({ tri: e.target.value as TriFeed })}
              aria-label="Trier par"
              className={`${CADRE} ${NEUTRE} h-full px-2 text-[13px] font-medium focus:border-accent focus:outline-none`}
            >
              {TRIS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </>
    </div>
  );
}
