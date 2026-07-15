import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { joinMeta, relativeDate } from "../lib/format.js";

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
      {deal.imageKey && (
        // Jamais d'URL Supabase construite ici — uniquement la route proxy
        // /img/deals/[publicId] (CONTRAT-V1 §6). Pas de w-full/object-cover :
        // la quasi-totalité des sources font ~1000px, mais le pipeline a un
        // repli thumbnail 240px (images.mjs) — w-full l'agrandirait et le
        // flouterait. max-w-full + h-auto laisse l'image à sa taille
        // naturelle, jamais agrandie (self-start : la carte est flex-col,
        // sans ça align-items:stretch réétirerait la largeur).
        <img
          src={`/img/deals/${deal.publicId}`}
          alt={deal.titre}
          loading="lazy"
          className="self-start max-w-full max-h-32 w-auto h-auto rounded-lg"
        />
      )}
      <div className="flex items-center justify-between text-xs font-bold text-muted">
        <span>{joinMeta(deal.enseigneSlug, deal.ville)}</span>
        <span className="text-rouge">{deal.score}°</span>
      </div>
      <h2 className="font-bold text-lg leading-snug line-clamp-2">{deal.titre}</h2>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-black text-rouge">{deal.prixPromo} DH</span>
        {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
        {pct !== null && <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{pct}%</span>}
      </div>
      {deal.description && <p className="text-sm text-muted leading-snug line-clamp-2">{deal.description}</p>}
      <span className="text-xs text-muted">{relativeDate(deal.createdAt)}</span>
    </Link>
  );
}
