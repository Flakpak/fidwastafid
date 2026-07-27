"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button.js";
import {
  ANCRE_RESULTATS,
  DIMENSIONS,
  RAISON_VILLE_SANS_OBJET,
  TRIS,
  FILTRES_PAR_DEFAUT,
  normaliserFiltres,
  optionDesactivee,
  villeSansObjet,
  type EtatFiltres,
  type TypeAchat,
  type TriFeed,
} from "../lib/filtresFeed.js";
import { SegmenteOuAcheter } from "./controlesFiltres.js";
import { useFacettes } from "./useFacettes.js";
import type { Facette, Facettes } from "./api/v1/_lib/dealsFacettes.js";

export type SectionFeuille = "categorie" | "ville" | "reglages";

/** Ordre imposé : Catégorie, Ville, Où acheter, Trier par. */
const ANCRES: Record<SectionFeuille, string> = {
  categorie: "categorie",
  ville: "ville",
  reglages: "categorie",
};

function compteur(facettes: Facettes | null, dimension: "categories" | "villes", valeur: string): number | null {
  if (!facettes) return null;
  const trouve: Facette | undefined = facettes[dimension].find((f) => f.valeur === valeur);
  return trouve ? trouve.n : null;
}

/**
 * Ligne d'option — choix unique. Un vrai `<input type="radio">` masqué :
 * exclusivité, groupement et navigation aux flèches natifs. Cible tactile
 * ≥44px (`min-h-11`).
 *
 * À zéro, l'option est GRISÉE et non sélectionnable — sauf si c'est le choix
 * courant, qu'il faut toujours pouvoir quitter. On apprend ainsi qu'elle
 * existe sans pouvoir s'y enfermer.
 */
function Option({
  name,
  label,
  valeur,
  choisi,
  n,
  desactive = false,
  onChoisir,
}: {
  name: string;
  label: string;
  valeur: string;
  choisi: boolean;
  n: number | null;
  desactive?: boolean;
  onChoisir: (v: string) => void;
}) {
  const vide = optionDesactivee({ n, choisi, sansObjet: desactive });
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-[9px] px-3 text-sm ${
        vide
          ? "cursor-default text-ink-subtle opacity-50"
          : `cursor-pointer ${choisi ? "bg-accent-soft font-bold text-accent" : "text-ink hover:bg-surface-subtle"}`
      } has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent`}
    >
      <input
        type="radio"
        name={name}
        value={valeur}
        checked={choisi}
        disabled={vide}
        onChange={() => onChoisir(valeur)}
        className="sr-only"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {n !== null && (
        <span className={`shrink-0 text-xs tabular-nums ${choisi ? "text-accent" : "text-ink-subtle"}`}>{n}</span>
      )}
    </label>
  );
}

/** `data-section` plutôt qu'un ref par section : l'ouverture positionnée
 *  n'a besoin de la section qu'au moment de l'ouverture, une requête DOM
 *  ponctuelle suffit — et rien n'est accédé pendant le rendu. */
function Section({
  id,
  titre,
  aide,
  children,
}: {
  id: string;
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section={id}
      aria-labelledby={`feuille-${id}`}
      className="border-b border-border px-3 py-4 last:border-b-0"
    >
      <h3 id={`feuille-${id}`} className="px-3 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-subtle">
        {titre}
      </h3>
      {aide && <p className="px-3 pb-2 text-xs text-ink-muted">{aide}</p>}
      {children}
    </section>
  );
}

/**
 * Retour du focus sur l'élément déclencheur — exigence explicite, pas
 * seulement le comportement par défaut du navigateur.
 *
 * Repli nécessaire : le filtre qu'on vient d'appliquer peut avoir DÉSACTIVÉ
 * son propre déclencheur (choisir « En ligne » rend le sélecteur de ville
 * sans objet). Le focus retomberait alors sur `<body>`, c'est-à-dire tout en
 * haut du document au clavier. Il va sur le compteur de résultats : la zone
 * qui vient précisément de changer.
 */
function rendreLeFocus(declencheur: HTMLElement | null) {
  if (declencheur?.isConnected && !declencheur.matches(":disabled")) {
    declencheur.focus();
    if (document.activeElement === declencheur) return;
  }
  document.getElementById(ANCRE_RESULTATS)?.focus();
}

function libelleApplication(total: number | null): string {
  if (total === null) return "Afficher les résultats";
  if (total === 0) return "Aucun deal ne correspond";
  return total === 1 ? "Afficher 1 deal" : `Afficher ${total} deals`;
}

/**
 * Feuille de filtres — UNE seule feuille, trois entrées (sélecteur catégorie,
 * sélecteur ville, bouton réglages), ouverte sur la section correspondante.
 *
 * `<dialog>` natif ouvert par `showModal()` plutôt qu'un piège à focus
 * maison : le confinement du focus, la fermeture par Échap et l'inertisation
 * du reste de la page sont alors garantis par le navigateur, pas par du code
 * qu'il faudrait maintenir. Le retour du focus sur l'élément déclencheur est
 * néanmoins explicite ci-dessous — c'est une exigence, pas un effet de bord
 * à espérer.
 *
 * Le composant n'est monté QUE pendant l'ouverture (clé de section côté
 * appelant) : le brouillon repart donc toujours des filtres appliqués, sans
 * effet de réinitialisation à écrire.
 */
export function FeuilleFiltres({
  section,
  declencheur,
  filtres,
  facettesInitiales,
  onFermer,
  onAppliquer,
}: {
  section: SectionFeuille;
  /** Élément qui a ouvert la feuille, fourni par l'appelant : il ne peut PAS
   *  être déduit ici de `document.activeElement`, que `showModal()` a déjà
   *  déplacé à l'intérieur de la feuille. */
  declencheur: HTMLElement | null;
  filtres: EtatFiltres;
  facettesInitiales: Facettes | null;
  onFermer: () => void;
  onAppliquer: (e: EtatFiltres) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const corpsRef = useRef<HTMLDivElement>(null);
  const [brouillon, setBrouillon] = useState<EtatFiltres>(filtres);
  const { facettes } = useFacettes(brouillon, facettesInitiales);

  const villeInactive = villeSansObjet(brouillon);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    // Ouverture POSITIONNÉE sur la section demandée. `scrollTop` direct
    // plutôt que scrollIntoView : celui-ci remonterait aussi la page
    // derrière la feuille.
    const corps = corpsRef.current;
    const cible = corps?.querySelector<HTMLElement>(`[data-section="${ANCRES[section]}"]`);
    if (cible && corps) corps.scrollTop = cible.offsetTop - corps.offsetTop;

    // Filet de sécurité UNIQUEMENT : `close` ne remonte pas, et il ne se
    // déclenche pas de façon fiable partout (constaté en vérification, un
    // `showModal()` suivi d'un `close()` ne l'émettait pas du tout). L'état
    // d'ouverture ne s'appuie donc pas dessus — `fermer()` ci-dessous ferme
    // ET met à jour l'état, quel que soit le chemin. Les deux sont
    // idempotents.
    dialog.addEventListener("close", onFermer);

    return () => {
      dialog.removeEventListener("close", onFermer);
      // Le démontage à vide de StrictMode (dev) laisse la feuille ouverte :
      // ne pas rendre le focus dans ce cas, sinon il quitte la feuille juste
      // après son ouverture.
      if (!dialog.open) rendreLeFocus(declencheur);
    };
  }, [section, onFermer, declencheur]);

  /**
   * Chemin de fermeture UNIQUE — bouton, application, appui hors panneau et
   * Échap y passent tous. Ferme le dialogue ET remonte l'état : rien ne
   * dépend d'un événement `close` qui peut ne jamais venir, sans quoi la
   * feuille disparaîtrait de l'écran en restant « ouverte » pour React, et
   * un second clic sur le même déclencheur ne rouvrirait plus rien.
   */
  const fermer = () => {
    dialogRef.current?.close();
    onFermer();
  };

  const appliquer = () => {
    onAppliquer(normaliserFiltres(brouillon));
    fermer();
  };

  const modifier = (patch: Partial<EtatFiltres>) => setBrouillon((prev) => normaliserFiltres({ ...prev, ...patch }));

  return (
    <dialog
      ref={dialogRef}
      // Fermeture par appui HORS panneau : sur un `<dialog>` modal, un clic
      // dans la zone de fond a pour cible l'élément dialog lui-même.
      onClick={(e) => {
        if (e.target === dialogRef.current) fermer();
      }}
      // Échap traité explicitement, et la fermeture native annulée : sinon
      // le navigateur ferme le dialogue de son côté sans que l'état le sache.
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          fermer();
        }
      }}
      aria-labelledby="feuille-titre"
      className="mx-auto mb-0 mt-auto max-h-[88vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-surface p-0 text-ink backdrop:bg-ink/50 sm:my-auto sm:rounded-2xl"
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <h2 id="feuille-titre" className="text-base font-extrabold">
            Filtres
          </h2>
          <button
            type="button"
            onClick={() => setBrouillon({ ...FILTRES_PAR_DEFAUT })}
            className="ml-auto rounded-[9px] px-2 py-1 text-xs font-bold text-accent underline underline-offset-2 hover:bg-accent-soft focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Tout effacer
          </button>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer les filtres"
            className="flex h-11 w-11 items-center justify-center rounded-[9px] text-ink-muted hover:bg-surface-subtle focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" className="h-5 w-5">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={corpsRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Section id="categorie" titre={DIMENSIONS.categorie.nom}>
            <Option
              name="feuille-categorie"
              label={DIMENSIONS.categorie.neutre}
              valeur=""
              choisi={brouillon.categorie === ""}
              n={facettes ? facettes.totalSansCategorie : null}
              onChoisir={(v) => modifier({ categorie: v })}
            />
            {DIMENSIONS.categorie.valeurs.map((c) => (
              <Option
                key={c}
                name="feuille-categorie"
                label={c}
                valeur={c}
                choisi={brouillon.categorie === c}
                n={compteur(facettes, "categories", c)}
                onChoisir={(v) => modifier({ categorie: v })}
              />
            ))}
          </Section>

          {/* Désactivée avec sa raison plutôt que laissée active sans
              effet : « En ligne » rend la ville sans objet. */}
          <Section
            id="ville"
            titre={DIMENSIONS.ville.nom}
            aide={villeInactive ? RAISON_VILLE_SANS_OBJET : undefined}
          >
            <Option
              name="feuille-ville"
              label={DIMENSIONS.ville.neutre}
              valeur=""
              choisi={brouillon.ville === ""}
              desactive={villeInactive}
              n={villeInactive || !facettes ? null : facettes.totalSansVille}
              onChoisir={(v) => modifier({ ville: v })}
            />
            {DIMENSIONS.ville.valeurs.map((v) => (
              <Option
                key={v}
                name="feuille-ville"
                label={v}
                valeur={v}
                choisi={brouillon.ville === v}
                desactive={villeInactive}
                n={villeInactive ? null : compteur(facettes, "villes", v)}
                onChoisir={(x) => modifier({ ville: x })}
              />
            ))}
          </Section>

          <Section id="ou-acheter" titre="Où acheter">
            <div className="px-3">
              <SegmenteOuAcheter
                name="feuille-ou-acheter"
                valeur={brouillon.type}
                onChange={(t: TypeAchat) => modifier({ type: t })}
                className="h-11"
              />
            </div>
          </Section>

          <Section id="tri" titre="Trier par">
            {TRIS.map((t) => (
              <Option
                key={t.value}
                name="feuille-tri"
                label={t.label}
                valeur={t.value}
                choisi={brouillon.tri === t.value}
                // Le tri ne retire aucun deal : un compteur par option
                // n'aurait rien à compter, il serait le même partout.
                n={null}
                onChoisir={(v) => modifier({ tri: v as TriFeed })}
              />
            ))}
          </Section>
        </div>

        <footer className="shrink-0 border-t border-border p-3">
          <Button variant="primary" onClick={appliquer} className="h-11 w-full">
            {libelleApplication(facettes ? facettes.total : null)}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
