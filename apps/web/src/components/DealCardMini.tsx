import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";

/** Parité avec DealCard.reduction() — même calcul, dupliqué volontairement
 *  (fonction pure de deux lignes, même pattern déjà répété dans ShareButton,
 *  deal/[slugAndId]/page.tsx). */
function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/**
 * Carte compacte — « deals liés » en bas de fiche (état des lieux SEO du
 * 08/08/2026 : « aucun chemin entre les fiches, aujourd'hui inexistant »).
 * Volontairement dépouillée de DealCard (pas de pilule de vote, pas de
 * commentaires, pas de partage) : une fiche deal n'est pas un second feed,
 * ces quelques cartes ne sont qu'une porte vers d'autres fiches.
 */
export function DealCardMini({ deal }: { deal: Deal }) {
  const pct = reduction(deal);
  const dealHref = `/deal/${dealUrlSlug(deal.titre, deal.publicId)}`;

  return (
    <Link
      href={dealHref}
      className="group/lien flex flex-col overflow-hidden rounded-[11px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,24,21,0.05)] transition-[border-color,box-shadow,transform] duration-[140ms] hover:-translate-y-px hover:border-accent-line hover:shadow-[0_4px_14px_rgba(26,24,21,0.09)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="bg-white border-b border-border flex items-center justify-center p-4 h-28">
        {deal.imageKey ? (
          <img
            src={`/img/deals/${deal.publicId}`}
            alt={deal.titre}
            loading="lazy"
            className="max-w-full max-h-full w-auto h-auto object-contain"
          />
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            className="w-8 h-8 text-ink-subtle/60"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5-4.5 4.5-2-2L3 19" />
          </svg>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-bold text-sm leading-snug line-clamp-2 text-ink transition-colors duration-[130ms] motion-reduce:transition-none group-hover/lien:text-accent">
          {deal.titre}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-base font-bold text-ink tabular-nums">
            {deal.prixPromo}
            <span className="text-[11px] font-medium text-ink-subtle"> DH</span>
          </span>
          {pct !== null && (
            <span className="rounded-[4px] bg-accent px-1.5 py-[2px] text-[11px] font-semibold text-white tabular-nums">
              -{pct}%
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
