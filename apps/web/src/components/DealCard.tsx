import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";

function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

export function DealCard({ deal }: { deal: Deal }) {
  const pct = reduction(deal);
  return (
    <Link
      href={`/deal/${dealUrlSlug(deal.titre, deal.publicId)}`}
      className="bg-white border border-bordure rounded-xl p-4 flex flex-col gap-2 hover:border-rouge-clair transition-colors"
    >
      <div className="flex items-center justify-between text-xs font-bold text-muted">
        <span>
          {deal.enseigneSlug}
          {deal.ville ? ` · ${deal.ville}` : ""}
        </span>
        <span className="text-rouge">🔥 {deal.score}</span>
      </div>
      <h2 className="font-bold text-lg leading-snug line-clamp-2">{deal.titre}</h2>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-black text-rouge">{deal.prixPromo} DH</span>
        {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
        {pct !== null && <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{pct}%</span>}
      </div>
    </Link>
  );
}
