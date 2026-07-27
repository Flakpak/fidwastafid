"use client";

import { OU_ACHETER, type TypeAchat } from "../lib/filtresFeed.js";

/**
 * Contrôles partagés par la barre de filtres et la feuille — une seule
 * implémentation par contrôle, quel que soit l'endroit où il apparaît.
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : au repos, contour `border-strong` et
 * encre lisible (règle 2 — jamais un gris d'inertie sur un cliquable) ;
 * l'état ACTIF est `accent-soft` cerclé `accent`, et il signifie « un filtre
 * s'applique », jamais « ce contrôle existe ».
 */

/**
 * Conteneur de page partagé par la barre collante et le contenu du feed.
 *
 * Un seul jeu de classes pour les deux : la rangée de filtres est alignée sur
 * la colonne de contenu par CONSTRUCTION, et non par une valeur recopiée qui
 * se désynchroniserait à la première modification de l'autre — le même piège
 * que l'ancien `top-[70px]` recopié de la sidebar vers la barre de filtres.
 * La barre s'arrête donc à la largeur du contenu, elle ne va plus de bord à
 * bord.
 */
export const CONTENEUR = "mx-auto w-full max-w-2xl px-4 lg:max-w-5xl";

/**
 * Seuil de la rangée unique desktop. `lg` et non `md` : mesuré en
 * vérification, les cinq contrôles (recherche, catégorie, ville, « Où
 * acheter », « Trier par ») ne tiennent pas sous 1024px sans déborder
 * horizontalement — c'est précisément le défaut que ce lot supprime. En
 * dessous, la disposition en trois rangées s'applique, à toute largeur.
 */

export const NEUTRE = "border-border-strong bg-surface text-ink-muted hover:border-accent-line hover:text-accent";
export const ACTIF = "border-accent bg-accent-soft text-accent";

/** Bordure + focus communs à tous les contrôles de la barre. */
export const CADRE =
  "rounded-[9px] border transition duration-[130ms] ease-out motion-reduce:transition-none " +
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function IconeLoupe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconeReglages({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={className}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}

export function IconeChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Champ de recherche — la loupe est posée EN SURIMPRESSION dans le padding
 * gauche du champ, jamais dans un conteneur qui volerait de la largeur : le
 * champ occupe toute la place disponible et n'est donc jamais tronqué, quelle
 * que soit la largeur d'écran.
 */
export function ChampRecherche({
  valeur,
  onChange,
  className,
}: {
  valeur: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className ?? ""}`}>
      <IconeLoupe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Rechercher un deal ou une enseigne"
        placeholder="Rechercher un deal, une enseigne..."
        className={`${CADRE} h-full w-full border-border-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none`}
      />
    </div>
  );
}

/**
 * Sélecteur d'une dimension — ouvre la feuille sur la section correspondante.
 *
 * `min-w-0` + `truncate` : une valeur trop longue est coupée par des points
 * de suspension. Ni retour à la ligne ni rétrécissement de police, qui
 * désaligneraient les deux sélecteurs de la rangée 3 l'un par rapport à
 * l'autre.
 */
export function SelecteurDimension({
  etiquette,
  actif,
  desactive,
  titre,
  onClick,
  className,
}: {
  etiquette: string;
  actif: boolean;
  desactive?: boolean;
  titre?: string;
  onClick: (declencheur: HTMLButtonElement) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      disabled={desactive}
      title={titre}
      aria-haspopup="dialog"
      className={`${CADRE} flex h-full min-w-0 items-center gap-1.5 px-3 text-sm font-medium disabled:cursor-default disabled:opacity-50 ${
        actif ? ACTIF : NEUTRE
      } ${className ?? ""}`}
    >
      <span className="truncate">{etiquette}</span>
      <IconeChevron className="ml-auto h-4 w-4 shrink-0 opacity-70" />
    </button>
  );
}

/**
 * « Où acheter » — trois options exclusives.
 *
 * Vrais `<input type="radio">` masqués visuellement plutôt qu'un groupe de
 * `<button aria-pressed>` : l'exclusivité, le groupement et la navigation au
 * clavier par flèches sont alors natifs, sans roving tabindex à maintenir.
 * `name` est passé par l'appelant — la barre et la feuille affichent le même
 * contrôle en même temps, deux groupes de même nom fusionneraient.
 */
export function SegmenteOuAcheter({
  name,
  valeur,
  onChange,
  className,
}: {
  name: string;
  valeur: TypeAchat;
  onChange: (v: TypeAchat) => void;
  className?: string;
}) {
  return (
    <fieldset className={`flex h-full min-w-0 gap-1 rounded-[9px] border border-border-strong bg-surface p-1 ${className ?? ""}`}>
      <legend className="sr-only">Où acheter</legend>
      {OU_ACHETER.map((o) => (
        <label
          key={o.value || "partout"}
          className={`flex min-w-0 flex-1 cursor-pointer items-center justify-center rounded-[6px] px-2.5 text-[13px] font-medium transition duration-[130ms] motion-reduce:transition-none ${
            valeur === o.value ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-accent"
          } has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={valeur === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
