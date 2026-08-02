import type { ComponentProps } from "react";

/**
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ PRIMITIVE DE CHARTE — CONSERVÉE SANS APPELANT. NE PAS SUPPRIMER AU    │
 * │ FIL D'UN NETTOYAGE.                                                   │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * `Chip` n'a plus aucun appelant depuis le lot 7 (28/07/2026) : les puces de
 * filtre du feed ont laissé place à la colonne latérale et à la feuille
 * mobile. Elle est conservée sciemment — CONTRAT-V1 §8 définit une CHARTE,
 * pas un inventaire d'usages : la forme « filtre en pilule » y est tranchée,
 * et la retirer parce qu'aucun écran ne l'emploie ce mois-ci ferait
 * redécouvrir la question au prochain qui en a besoin.
 *
 * Sa suppression est donc un AMENDEMENT DU CONTRAT, jamais un nettoyage
 * (§8, règle 6).
 *
 * Le prix de cette conservation est payé : `apps/web/tests/primitives.ts`
 * rend ses deux états et vérifie que chaque token qu'elle emploie existe
 * toujours dans le `@theme` de globals.css. Sans appelant, rien d'autre ne la
 * ferait échouer — elle compilerait en référençant des tokens supprimés, et
 * rendrait du vide le jour où on la ressort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Chip primitif — charte Tadelakt (CONTRAT-V1 §8). Filtre/sélecteur en pilule.
 * Inactif : `surface` + contour `border-strong` + `ink-muted` (un cliquable
 * porte toujours un contour, jamais un gris d'inertie — §8, règle 2).
 * Actif : fond `accent`, texte blanc (8,4:1). Cible tactile ≥44px en mobile.
 */
const base =
  "inline-flex items-center justify-center h-8 rounded-[20px] px-3.5 text-sm font-medium " +
  "border cursor-pointer whitespace-nowrap " +
  "transition duration-[130ms] ease-out active:translate-y-px " +
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none " +
  "max-sm:min-h-11";

/** Lot 4 : le filtre actif passe du vert plein au vert DOUX cerclé — sur une
 *  barre qui en aligne dix, dix pastilles pleines faisaient beaucoup, et
 *  l'aplat doit rester réservé au bouton primaire (§8, règle 1). */
const inactive =
  "bg-surface border-border-strong text-ink-muted hover:bg-accent-soft hover:border-accent-line hover:text-accent";
const active = "bg-accent-soft border-accent text-accent";

export function Chip({
  active: isActive = false,
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  const classes = [base, isActive ? active : inactive, className].filter(Boolean).join(" ");
  return <button type={type} aria-pressed={isActive} className={classes} {...props} />;
}
