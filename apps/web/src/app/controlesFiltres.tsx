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
 * Colonne de CONTENU, à droite de la colonne de filtres — repris de main :
 * centré et borné en mobile (où il n'y a pas de colonne latérale), puis
 * PLEINE LARGEUR au-delà. Aucune largeur maximale en desktop : elle
 * laisserait de larges marges vides des deux côtés alors que la colonne
 * latérale est, elle, collée au bord gauche de la fenêtre.
 */
export const CONTENEUR = "mx-auto w-full max-w-2xl px-4 md:mx-0 md:max-w-none";

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
