import type { ComponentProps } from "react";

/**
 * Champs primitifs — charte Tadelakt (CONTRAT-V1 §8). Contour `border-strong`,
 * placeholder `ink-subtle` (5,2:1 sur blanc). Focus : bordure `accent` + halo
 * `0 0 0 3px rgba(47,107,87,.13)` (et non l'anneau outline des boutons — un
 * champ signale son focus par sa bordure, pas par un anneau détaché).
 * `invalid` bascule sur le registre d'alerte `warn` (bordure + halo).
 * Cible tactile ≥44px en mobile.
 */
const base =
  "w-full rounded-[9px] border bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-subtle transition duration-[130ms] ease-out focus:outline-none " +
  "motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none " +
  "max-sm:min-h-11";

const normalState = "border-border-strong focus:border-accent focus:shadow-[0_0_0_3px_rgba(47,107,87,0.13)]";
const invalidState = "border-warn focus:border-warn focus:shadow-[0_0_0_3px_rgba(124,96,21,0.15)]";

export function Input({ className, invalid = false, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  const classes = [base, invalid ? invalidState : normalState, "h-[42px]", className].filter(Boolean).join(" ");
  return <input className={classes} {...props} />;
}

export function Textarea({ className, invalid = false, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  const classes = [base, invalid ? invalidState : normalState, "min-h-[84px] py-2 resize-y", className].filter(Boolean).join(" ");
  return <textarea className={classes} {...props} />;
}
