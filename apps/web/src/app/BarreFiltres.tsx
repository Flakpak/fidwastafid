"use client";

import { ACTIF, CADRE, ChampRecherche, IconeReglages, NEUTRE } from "./controlesFiltres.js";
import type { SectionFeuille } from "./FeuilleFiltres.js";

/**
 * Rangée haute du bloc collant — la recherche, et en mobile seulement le
 * bouton « Filtrer » qui ouvre la feuille.
 *
 * PLUS AUCUN FILTRE DE DIMENSION, ET PLUS DE TRI. En desktop ils vivent tous
 * dans la colonne latérale ; en mobile, dans la feuille. Il ne reste ici que
 * la recherche, qui n'est ni l'un ni l'autre.
 *
 * Aucun défilement horizontal, à aucune largeur : hauteur fixe, un seul
 * élément élastique (la recherche) qui absorbe la largeur restante.
 */
export function BarreFiltres({
  saisie,
  nbActifs,
  onSaisie,
  onOuvrir,
}: {
  saisie: string;
  nbActifs: number;
  onSaisie: (v: string) => void;
  /** Le déclencheur voyage avec la section : c'est sur LUI que le focus
   *  revient à la fermeture, et il n'est pas déductible après coup
   *  (`showModal()` a déjà déplacé le focus dans la feuille). */
  onOuvrir: (section: SectionFeuille, declencheur: HTMLElement) => void;
}) {
  return (
    <div className="flex h-11 gap-2 md:h-10">
      <ChampRecherche valeur={saisie} onChange={onSaisie} className="h-full flex-1 md:max-w-md" />

      {/* Mobile uniquement : au-dessus de md, la colonne latérale porte les
          filtres et ce bouton n'aurait rien à ouvrir que la colonne
          n'affiche déjà. */}
      <button
        type="button"
        onClick={(e) => onOuvrir("reglages", e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={nbActifs > 0 ? `Filtrer — ${nbActifs} filtre${nbActifs > 1 ? "s" : ""} actif${nbActifs > 1 ? "s" : ""}` : "Filtrer"}
        className={`${CADRE} ${nbActifs > 0 ? ACTIF : NEUTRE} flex h-full shrink-0 items-center gap-2 px-3 text-sm font-medium md:hidden`}
      >
        <IconeReglages className="h-5 w-5 shrink-0" />
        Filtrer
        {/* Décompte MASQUÉ à zéro : un compteur qui affiche « 0 » dit qu'il
            se passe quelque chose là où il ne se passe rien. Le tri n'y entre
            pas — il y en a toujours un, le compter rendrait le badge
            inutile. */}
        {nbActifs > 0 && (
          <span
            aria-hidden="true"
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold tabular-nums text-white"
          >
            {nbActifs}
          </span>
        )}
      </button>
    </div>
  );
}
