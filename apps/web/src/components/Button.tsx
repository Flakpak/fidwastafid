import type { ComponentProps } from "react";

/**
 * Bouton primitif — charte Tadelakt (CONTRAT-V1 §8). L'affordance vient du
 * contour, du contraste et de l'état, jamais de la saturation. Rappel §8,
 * règle 1 : une seule action pleine (`variant="primary"`) par écran.
 *
 * Détails communs : anneau focus 2px `accent` (outline-offset 2px), enfoncement
 * `translateY(1px)`, transitions ~130ms coupées sous `prefers-reduced-motion`,
 * cible tactile portée à ≥44px en mobile (`max-sm:min-h-11`) sans changer la
 * hauteur desktop (a11y — WCAG 2.5.5).
 *
 * Modificateur `arabic` : Scheherazade New, `rtl`, +2px de corps et +3px de
 * padding bas — le rendu arabe déborde optiquement vers le bas.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] " +
  "border font-medium cursor-pointer select-none " +
  "transition duration-[130ms] ease-out active:translate-y-px " +
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "motion-reduce:transition-none " +
  "disabled:opacity-40 disabled:pointer-events-none " +
  "max-sm:min-h-11";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-surface-base border-transparent shadow-sm hover:bg-[#332e28]",
  secondary: "bg-surface text-ink border-border-strong hover:bg-surface-subtle hover:border-[#b9b0a0]",
  ghost: "bg-transparent text-ink-muted border-transparent hover:bg-[#eae5dc] hover:text-ink",
  danger: "bg-surface text-hot border-[#e4c3b7] hover:bg-hot-soft",
};

const heights: Record<ButtonSize, string> = { md: "h-10", sm: "h-8" };
const paddings: Record<ButtonSize, string> = { md: "px-4", sm: "px-3" };

export function Button({
  variant = "secondary",
  size = "md",
  arabic = false,
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  arabic?: boolean;
}) {
  const height = variant === "ghost" ? "h-[34px]" : heights[size];
  const padding = variant === "ghost" ? "px-3" : paddings[size];
  const typography = arabic
    ? "font-arabic [direction:rtl] text-[16px] pb-[3px]"
    : size === "sm"
      ? "text-[13px]"
      : "text-sm";

  const classes = [base, variants[variant], height, padding, typography, className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...props} />;
}
