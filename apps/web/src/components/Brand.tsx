/**
 * Marque Fidwastafid — CONTRAT-V1 §8 (amendement du 26/07/2026, lot 5).
 *
 * Remplace l'ancien `Seal.tsx` : le médaillon circulaire à anneau safran est
 * abandonné. L'identité est désormais un logotype latin **FIDWASTAFID** et sa
 * forme carrée, le monogramme **FwS**.
 *
 * Les fichiers vivent dans `public/brand/` et sont servis TELS QUELS, en
 * `<img>` : ce sont des tracés vectoriels de référence, jamais du texte
 * composé, jamais redessinés en JSX. Les inliner coûterait jusqu'à 12 ko de
 * markup par rendu pour un gain nul (aucune couleur à piloter : chaque
 * variante est un fichier).
 *
 * Zone de protection (§8) : le logotype exige une marge libre d'au moins la
 * hauteur d'une capitale. Les appelants ne collent aucun élément contre lui —
 * voir les `gap`/`px` des consommateurs (en-tête, pied de page).
 *
 * `prefers-color-scheme` n'entre pas en jeu : le site n'a pas de thème sombre.
 * `ton="sombre"` sert uniquement aux surfaces encre existantes (chrome admin,
 * ticker), jamais à une préférence système.
 */

export type BrandForme = "full" | "wordmark" | "mark";
export type BrandTon = "clair" | "sombre";

/**
 * Ratio largeur/hauteur de chaque forme, lu sur le `viewBox` des fichiers.
 * Sert à dériver la largeur depuis la hauteur : on ne contraint jamais les
 * deux dimensions à des valeurs arbitraires (le logotype garde son ratio),
 * mais on renseigne `width`+`height` COHÉRENTS pour réserver la place et
 * éviter un décalage de mise en page au chargement.
 */
const RATIOS: Record<BrandForme, number> = {
  full: 768 / 133.2, // 5.766
  wordmark: 768 / 94, // 8.170
  mark: 1,
};

/** En dessous de ce rendu, le monogramme passe à la variante à rayon d'angle
 *  réduit : à 16 px, un `rx` de 22 % ronge les lettres. */
const SEUIL_RAYON_REDUIT = 20;

function fichier(forme: BrandForme, ton: BrandTon, hauteur: number): string {
  if (forme === "mark") {
    if (hauteur < SEUIL_RAYON_REDUIT) return "mark-16.svg";
    // Le monogramme est une tuile autoportante (fond compris) : sur une
    // surface encre, la variante plâtre garde le contraste, là où la tuile
    // accent s'y assombrirait.
    return ton === "sombre" ? "mark-plat.svg" : "mark.svg";
  }
  const base = forme === "full" ? "logo-full" : "logo-wordmark";
  return ton === "sombre" ? `${base}-dark.svg` : `${base}.svg`;
}

export function Brand({
  forme = "wordmark",
  ton = "clair",
  hauteur,
  className,
  alt = "Fidwastafid",
}: {
  forme?: BrandForme;
  ton?: BrandTon;
  /** Hauteur de rendu en px — la largeur en découle, le ratio est préservé. */
  hauteur: number;
  className?: string;
  /** Vide pour un logo purement décoratif doublé d'un texte accessible. */
  alt?: string;
}) {
  const largeur = Math.round(hauteur * RATIOS[forme]);
  return (
    <img
      src={`/brand/${fichier(forme, ton, hauteur)}`}
      width={largeur}
      height={hauteur}
      alt={alt}
      className={className}
    />
  );
}
