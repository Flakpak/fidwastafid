import type { ComponentProps } from "react";

/**
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

const inactive = "bg-surface border-border-strong text-ink-muted hover:bg-surface-subtle hover:text-ink";
const active = "bg-accent border-accent text-white";

export function Chip({
  active: isActive = false,
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  const classes = [base, isActive ? active : inactive, className].filter(Boolean).join(" ");
  return <button type={type} aria-pressed={isActive} className={classes} {...props} />;
}
