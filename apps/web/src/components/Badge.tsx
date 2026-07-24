import type { ComponentProps } from "react";

/**
 * Badge primitif — charte Tadelakt (CONTRAT-V1 §8). Étiquette non interactive.
 * `hot` / `cold` sont réservés à la température des deals (§8, règle 3) : un
 * badge `hot` porte toujours un chiffre/état, jamais une teinte seule (a11y —
 * l'état n'est jamais exprimé par la seule couleur).
 */
export type BadgeVariant = "hot" | "accent" | "warn" | "outline" | "cold";

const base =
  "inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[11.5px] font-medium leading-none";

const variants: Record<BadgeVariant, string> = {
  hot: "bg-hot-soft text-hot",
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  cold: "bg-cold-soft text-cold",
  outline: "bg-transparent text-ink-muted border border-border-strong",
};

export function Badge({
  variant = "outline",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  const classes = [base, variants[variant], className].filter(Boolean).join(" ");
  return <span className={classes} {...props} />;
}
