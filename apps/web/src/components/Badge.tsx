import type { ComponentProps } from "react";

/**
 * Badge primitif — charte Tadelakt (CONTRAT-V1 §8). Étiquette non interactive.
 * `hot` / `cold` sont réservés à la température des deals (§8, règle 3) : un
 * badge `hot` porte toujours un chiffre/état, jamais une teinte seule (a11y —
 * l'état n'est jamais exprimé par la seule couleur).
 */
export type BadgeVariant = "hot" | "accent" | "warn" | "outline" | "cold";

/** Lot 4 : chaque variante porte un contour de sa propre famille — un badge
 *  doux cerclé se détache du blanc sans réclamer un aplat plein (§8, règle 1 :
 *  l'aplat reste au bouton primaire). */
const base =
  "inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11.5px] font-medium leading-none";

const variants: Record<BadgeVariant, string> = {
  hot: "bg-hot-soft text-hot border-hot-line",
  accent: "bg-accent-soft text-accent border-accent-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  cold: "bg-cold-soft text-cold border-cold-line",
  outline: "bg-transparent text-ink-muted border-border-strong",
};

export function Badge({
  variant = "outline",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  const classes = [base, variants[variant], className].filter(Boolean).join(" ");
  return <span className={classes} {...props} />;
}
