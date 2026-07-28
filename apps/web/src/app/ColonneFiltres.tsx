"use client";

import {
  DIMENSIONS,
  OU_ACHETER,
  RAISON_VILLE_SANS_OBJET,
  optionDesactivee,
  villeSansObjet,
  type EtatFiltres,
  type TypeAchat,
} from "../lib/filtresFeed.js";
import { CADRE, NEUTRE } from "./controlesFiltres.js";
import type { Facettes } from "./api/v1/_lib/dealsFacettes.js";

/**
 * Colonne de filtres — desktop (≥ lg) UNIQUEMENT.
 *
 * Quatre dimensions ne tiennent pas sur une rangée horizontale : le lot
 * précédent l'avait constaté en libellés tronqués (« En bou… ») et en
 * espacements inégaux. Un jeu de filtres de cette taille se met en colonne,
 * comme chez Dealabs, HotUKDeals ou Amazon — la verticale donne à chaque
 * dimension la largeur d'une ligne entière, et le nombre de dimensions cesse
 * d'être une contrainte de mise en page.
 *
 * La colonne ne porte QUE des filtres : ni CTA, ni bloc de marque. Le CTA
 * arabe et le lien concept vivent dans la ligne de clôture du hero, qui
 * existe aussi en mobile — ce que l'ancien rail n'a jamais fait. Les remettre
 * ici en ferait des doublons visibles côte à côte sur le même écran.
 *
 * Le tri n'y est pas non plus : il ne réduit pas l'ensemble, il le réordonne.
 * Sa place est au-dessus du contenu qu'il ordonne.
 */

const TITRE_SECTION = "px-1 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle";

/** Ligne de la liste verticale — choix unique, `<input type="radio">` masqué :
 *  exclusivité, groupement et navigation aux flèches natifs. */
function Ligne({
  name,
  label,
  valeur,
  choisi,
  desactive,
  onChoisir,
}: {
  name: string;
  label: string;
  valeur: string;
  choisi: boolean;
  desactive: boolean;
  onChoisir: (v: string) => void;
}) {
  return (
    <label
      className={`flex min-h-9 items-center rounded-[8px] px-2.5 text-[13px] ${
        desactive
          ? "cursor-default text-ink-subtle opacity-45"
          : choisi
            ? "cursor-pointer bg-accent-soft font-semibold text-accent"
            : "cursor-pointer text-ink-muted hover:bg-surface-subtle hover:text-ink"
      } has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent`}
    >
      <input
        type="radio"
        name={name}
        value={valeur}
        checked={choisi}
        disabled={desactive}
        onChange={() => onChoisir(valeur)}
        className="sr-only"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

export function ColonneFiltres({
  filtres,
  facettes,
  nbActifs,
  onChange,
  onReinitialiser,
}: {
  filtres: EtatFiltres;
  /** Sert UNIQUEMENT à désactiver les options sans deal — plus aucun nombre
   *  n'est affiché. Sans elle, on pourrait s'enfermer dans un filtre vide. */
  facettes: Facettes | null;
  nbActifs: number;
  onChange: (patch: Partial<EtatFiltres>) => void;
  onReinitialiser: () => void;
}) {
  const villeInactive = villeSansObjet(filtres);
  const nbCategorie = (valeur: string) => facettes?.categories.find((c) => c.valeur === valeur)?.n ?? null;

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* ── Catégorie : liste verticale EN CLAIR, toutes visibles ──
          Pas de menu déroulant : douze valeurs tiennent dans une colonne, et
          les voir toutes est précisément ce qu'un menu empêche. */}
      <section aria-labelledby="colonne-categorie">
        <h2 id="colonne-categorie" className={TITRE_SECTION}>
          {DIMENSIONS.categorie.nom}
        </h2>
        <div className="flex flex-col">
          <Ligne
            name="colonne-categorie"
            label={DIMENSIONS.categorie.neutre}
            valeur=""
            choisi={filtres.categorie === ""}
            desactive={false}
            onChoisir={(v) => onChange({ categorie: v })}
          />
          {DIMENSIONS.categorie.valeurs.map((c) => (
            <Ligne
              key={c}
              name="colonne-categorie"
              label={c}
              valeur={c}
              choisi={filtres.categorie === c}
              desactive={optionDesactivee({ n: nbCategorie(c), choisi: filtres.categorie === c })}
              onChoisir={(v) => onChange({ categorie: v })}
            />
          ))}
        </div>
      </section>

      {/* ── Ville : menu déroulant ──
          Neuf valeurs aujourd'hui, et c'est la dimension qui s'allongera si
          le SEO local se développe : une liste verticale y deviendrait plus
          longue que la colonne entière. */}
      <section aria-labelledby="colonne-ville">
        <h2 id="colonne-ville" className={TITRE_SECTION}>
          {DIMENSIONS.ville.nom}
        </h2>
        <select
          value={filtres.ville}
          disabled={villeInactive}
          title={villeInactive ? RAISON_VILLE_SANS_OBJET : undefined}
          onChange={(e) => onChange({ ville: e.target.value })}
          aria-label={DIMENSIONS.ville.nom}
          className={`${CADRE} ${filtres.ville ? "border-accent bg-accent-soft font-semibold text-accent" : NEUTRE} h-9 w-full px-2 text-[13px] focus:border-accent focus:outline-none disabled:cursor-default disabled:opacity-50`}
        >
          <option value="">{DIMENSIONS.ville.neutre}</option>
          {DIMENSIONS.ville.valeurs.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {villeInactive && <p className="px-1 pt-2 text-xs text-ink-muted">{RAISON_VILLE_SANS_OBJET}</p>}
      </section>

      {/* ── Où acheter : trois options exclusives, en liste verticale ── */}
      <section aria-labelledby="colonne-ou-acheter">
        <h2 id="colonne-ou-acheter" className={TITRE_SECTION}>
          Où acheter
        </h2>
        <div className="flex flex-col">
          {OU_ACHETER.map((o) => (
            <Ligne
              key={o.value || "partout"}
              name="colonne-ou-acheter"
              label={o.label}
              valeur={o.value}
              choisi={filtres.type === o.value}
              desactive={false}
              onChoisir={(v) => onChange({ type: v as TypeAchat })}
            />
          ))}
        </div>
      </section>

      {/* Pied de colonne — n'apparaît que s'il y a quelque chose à effacer :
          un lien de réinitialisation permanent sur une vue non filtrée
          annonce un état qui n'existe pas. */}
      {nbActifs > 0 && (
        <button
          type="button"
          onClick={onReinitialiser}
          className="self-start rounded-[6px] px-1 text-[13px] font-bold text-accent underline underline-offset-4 hover:text-accent-hi focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}
