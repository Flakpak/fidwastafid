import type { ComponentProps } from "react";

/**
 * Champs primitifs — charte Tadelakt (CONTRAT-V1 §8). Contour `border-strong`,
 * placeholder `ink-subtle` (5,2:1 sur blanc). Focus : bordure `accent` + halo
 * `0 0 0 3px rgba(44,85,69,.13)` (et non l'anneau outline des boutons — un
 * champ signale son focus par sa bordure, pas par un anneau détaché).
 * Cible tactile ≥44px en mobile.
 */
const base =
  "w-full rounded-[9px] border border-border-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-ink-subtle transition duration-[130ms] ease-out " +
  "focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(44,85,69,0.13)] " +
  "motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none " +
  "max-sm:min-h-11";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const classes = [base, "h-[42px]", className].filter(Boolean).join(" ");
  return <input className={classes} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  const classes = [base, "min-h-[84px] py-2 resize-y", className].filter(Boolean).join(" ");
  return <textarea className={classes} {...props} />;
}
