import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { categorieIcon, relativeDate, shortDate } from "../lib/format.js";
import { CardVote } from "./CardVote.js";

function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/**
 * Carte deal — reste un composant serveur (feed SSR, Phase 4) : seul le
 * vote (CardVote) est un composant client, isolé, pour ne pas hydrater
 * toute la carte. Contrainte HTML : aucun élément interactif (bouton,
 * lien) ne peut être imbriqué dans le <Link> principal — ils vivent en
 * frères, hors de l'ancre, sinon DOM invalide (interactive-in-interactive).
 */
export function DealCard({ deal }: { deal: Deal }) {
  const pct = reduction(deal);
  const dealHref = `/deal/${dealUrlSlug(deal.titre, deal.publicId)}`;
  const isHot = deal.score >= 20;
  const aUneMeta = Boolean(deal.enseigneNom || deal.ville || deal.dateFin || isHot);

  return (
    <div className="bg-white border border-bordure rounded-xl p-4 flex flex-col gap-2 hover:border-rouge-clair transition-colors">
      <Link href={dealHref} className="flex flex-col gap-2">
        {deal.imageKey ? (
          // Jamais d'URL Supabase construite ici — uniquement la route proxy
          // /img/deals/[publicId] (CONTRAT-V1 §6). Pas de w-full/object-cover :
          // la quasi-totalité des sources font ~1000px, mais le pipeline a un
          // repli thumbnail 240px (images.mjs) — w-full l'agrandirait et le
          // flouterait. max-w-full + h-auto laisse l'image à sa taille
          // naturelle, jamais agrandie.
          <img
            src={`/img/deals/${deal.publicId}`}
            alt={deal.titre}
            loading="lazy"
            className="self-start max-w-full max-h-32 w-auto h-auto rounded-lg"
          />
        ) : (
          // Placeholder compact (zone fixe, pas la hauteur d'une vraie image)
          // — icône catégorie, porté depuis CAT_ICONS v1 (index.html racine).
          <span
            aria-hidden="true"
            className="w-12 h-12 flex items-center justify-center text-2xl bg-creme rounded-lg self-start"
          >
            {categorieIcon(deal.categorie)}
          </span>
        )}

        <h2 className="font-bold text-lg leading-snug line-clamp-2">{deal.titre}</h2>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-black text-rouge">{deal.prixPromo} DH</span>
          {deal.prixNormal && <span className="text-sm text-muted line-through">{deal.prixNormal} DH</span>}
          {pct !== null && <span className="text-xs font-bold bg-rouge text-white rounded px-2 py-0.5">-{pct}%</span>}
        </div>

        {aUneMeta && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {deal.enseigneNom && (
              <span>
                Dispo. chez <strong className="text-texte">{deal.enseigneNom}</strong>
              </span>
            )}
            {deal.ville && <span>📍 {deal.ville}</span>}
            {deal.dateFin && <span>⏰ {shortDate(deal.dateFin)}</span>}
            {isHot && <span className="text-rouge font-bold">🔥 Tendance</span>}
          </div>
        )}

        {deal.description && <p className="text-sm text-muted leading-snug line-clamp-2">{deal.description}</p>}
      </Link>

      <div className="flex items-center justify-between">
        <CardVote publicId={deal.publicId} initialScore={deal.score} />
        <span className="text-xs text-muted">{relativeDate(deal.createdAt)}</span>
      </div>

      <div className="flex items-center justify-between text-xs font-bold">
        {/* Pas de compteur — parité v1 exacte (dc-footer, index.html racine :
            le bouton "💬 Commentaires" n'affiche pas de nombre sur la carte,
            seule la page deal le fait). */}
        <Link href={`${dealHref}#commentaires`} className="text-muted hover:text-rouge">
          💬 Commentaires
        </Link>
        {deal.lien && (
          <a
            href={deal.lien}
            target="_blank"
            rel="noopener noreferrer"
            className="font-arabic text-bleu"
          >
            شوف الدييل ↗
          </a>
        )}
      </div>
    </div>
  );
}
