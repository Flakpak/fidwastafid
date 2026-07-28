"use client";

import { TRIS, type EtatFiltres, type TriFeed } from "../lib/filtresFeed.js";
import { ACTIF, CADRE, ChampRecherche, IconeReglages, NEUTRE } from "./controlesFiltres.js";
import type { SectionFeuille } from "./FeuilleFiltres.js";

/**
 * Rangée haute du bloc collant — recherche, et selon la largeur : le bouton
 * « Filtrer » (mobile) ou le tri (desktop).
 *
 * PLUS AUCUN FILTRE DE DIMENSION ICI. En mobile ils vivent dans la feuille,
 * en desktop dans la colonne latérale. Cette rangée ne porte donc plus que ce
 * qui n'est pas une dimension : la recherche, et le tri — qui ne réduit pas
 * l'ensemble, il le réordonne.
 *
 * Aucun défilement horizontal, à aucune largeur : la rangée a une hauteur
 * fixe et un seul élément élastique (la recherche), qui absorbe la largeur
 * restante. Aucun contrôle ne peut être poussé hors écran.
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
  return (
    <div className="flex flex-col gap-2">
      <>
        {/* ── Compact (jusqu'à lg) — UNE seule rangée, UNE seule commande ──
            Le bouton réglages et les deux sélecteurs ouvraient la même
            feuille : trois commandes pour une fonction, dont la troisième
            laissait croire qu'elle en cachait une autre. Corrigé par
            suppression — la rangée des deux sélecteurs disparaît, et avec
            elle une rangée de barre collante.

            L'état des filtres n'est donc plus lisible ici : il l'est
            entièrement dans le compteur de résultats sous la barre (nombre,
            filtres nommés en clair, réinitialisation). Ce bouton n'en porte
            que le décompte. */}
        <div className="flex h-11 gap-2 lg:hidden">
          <ChampRecherche valeur={saisie} onChange={onSaisie} className="h-full flex-1" />
          <button
            type="button"
            onClick={(e) => onOuvrir("reglages", e.currentTarget)}
            aria-haspopup="dialog"
            aria-label={nbActifs > 0 ? `Filtrer — ${nbActifs} filtre${nbActifs > 1 ? "s" : ""} actif${nbActifs > 1 ? "s" : ""}` : "Filtrer"}
            className={`${CADRE} ${nbActifs > 0 ? ACTIF : NEUTRE} flex h-full shrink-0 items-center gap-2 px-3 text-sm font-medium`}
          >
            <IconeReglages className="h-5 w-5 shrink-0" />
            Filtrer
            {/* Décompte MASQUÉ à zéro : un compteur qui affiche « 0 » dit
                qu'il se passe quelque chose là où il ne se passe rien. Le
                tri n'y entre pas — il y en a toujours un, le compter rendrait
                le badge inutile. */}
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

        {/* ── Desktop (≥ lg) — recherche à gauche, tri à droite. AUCUN filtre ──
            Les quatre dimensions sont passées dans la colonne latérale : une
            rangée horizontale ne les tenait pas (libellés tronqués,
            espacements inégaux). Ne restent ici que la recherche et le tri,
            qui ne sont pas des filtres de dimension — le tri ne réduit rien,
            il réordonne, d'où sa place au-dessus du contenu qu'il ordonne. */}
        <div className="hidden h-10 items-center gap-4 lg:flex">
          <ChampRecherche valeur={saisie} onChange={onSaisie} className="h-full min-w-0 max-w-sm flex-1" />
          <div className="ml-auto flex h-full shrink-0 items-center gap-2">
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
