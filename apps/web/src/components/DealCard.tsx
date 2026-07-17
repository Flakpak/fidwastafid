import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { categorieIcon, relativeDate, shortDate } from "../lib/format.js";
import { urgence } from "../lib/urgence.js";
import { CardVote } from "./CardVote.js";
import { UrgenceCountdown } from "./UrgenceCountdown.js";
import { ShareButton } from "./ShareButton.js";

function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/**
 * Carte deal — structure Dealabs (2 colonnes fixes, pilule de vote, CTA
 * proéminent), traduite dans la charte fidwastafid (rouge/or/crème,
 * Scheherazade New). Reste un composant serveur (feed SSR, Phase 4) : les
 * boutons de vote (CardVote), le compte à rebours (UrgenceCountdown) et le
 * partage (ShareButton) sont les seuls îlots client, isolés.
 *
 * Contrainte HTML : aucun élément interactif ne peut être imbriqué dans un
 * <Link> — la pilule de vote et le pied de carte (liens/boutons) vivent
 * donc hors des <Link> qui couvrent l'image et le bloc titre/prix/description.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const pct = reduction(deal);
  const dealHref = `/deal/${dealUrlSlug(deal.titre, deal.publicId)}`;
  const isHot = deal.score >= 20;
  const urg = urgence(deal);

  return (
    <div className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow overflow-hidden flex flex-row">
      {/* Colonne image — largeur fixe, la carte reste 2 colonnes même en
          mobile. Fond blanc (même blanc que la carte) : les photos produit
          ont elles-mêmes un fond blanc, un panneau teinté créerait un
          rectangle visible autour de l'image. Le filet vertical (border-r)
          sépare la zone image du contenu ; l'ombre de la carte la sépare
          du fond crème de la page. */}
      <Link
        href={dealHref}
        className="w-[110px] md:w-[180px] shrink-0 self-stretch flex items-center justify-center p-3 bg-white border-r border-bordure"
      >
        {deal.imageKey ? (
          // Jamais d'URL Supabase construite ici — uniquement la route proxy
          // /img/deals/[publicId] (CONTRAT-V1 §6). Pas de w-full/object-cover :
          // la quasi-totalité des sources font ~1000px, mais le pipeline a un
          // repli thumbnail 240px (images.mjs) — w-full l'agrandirait et le
          // flouterait. max-w-full + h-auto + object-contain laisse l'image à
          // sa taille naturelle, jamais agrandie.
          <img
            src={`/img/deals/${deal.publicId}`}
            alt={deal.titre}
            loading="lazy"
            className="max-w-full max-h-28 w-auto h-auto object-contain"
          />
        ) : (
          <span aria-hidden="true" className="text-4xl opacity-40">
            {categorieIcon(deal.categorie)}
          </span>
        )}
      </Link>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5 p-3">
        {/* a. Ligne haute : pilule de vote + urgence/tendance. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardVote publicId={deal.publicId} initialScore={deal.score} />
            {isHot && <span className="text-xs font-bold text-rouge">🔥 Tendance</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">{relativeDate(deal.createdAt)}</span>
            {urg?.mode === "expiree" && (
              <span className="text-xs font-bold bg-creme text-muted rounded-full px-2.5 py-1">Expiré</span>
            )}
            {urg?.mode === "compte-a-rebours" && <UrgenceCountdown dateFin={deal.dateFin!} />}
            {urg?.mode === "lointaine" && (
              <span className="text-xs text-muted">⏰ jusqu&apos;au {shortDate(deal.dateFin!)}</span>
            )}
          </div>
        </div>

        <Link href={dealHref} className="flex flex-col gap-1.5">
          {/* b. Titre. */}
          <h2 className="font-bold text-base leading-snug line-clamp-2 text-texte">{deal.titre}</h2>

          {/* c. Prix + confiance. */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-xl font-black text-rouge">{deal.prixPromo} DH</span>
            {deal.prixNormal && <span className="text-muted line-through">{deal.prixNormal} DH</span>}
            {pct !== null && (
              <span className="font-bold bg-vert/10 text-vert rounded-full px-2 py-0.5">-{pct}%</span>
            )}
            {(deal.enseigneNom || deal.ville) && <span aria-hidden="true" className="w-px h-3 bg-bordure" />}
            {deal.enseigneNom && (
              <span className="text-muted">
                Dispo. chez <strong className="text-texte">{deal.enseigneNom}</strong>
              </span>
            )}
            {deal.ville && <span className="text-muted">📍 {deal.ville}</span>}
            {deal.submitterPseudo && (
              <span className="flex items-center gap-1 text-muted">
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full bg-gradient-to-br from-rouge to-orange text-white flex items-center justify-center text-[9px] font-black"
                >
                  {deal.submitterPseudo[0]?.toUpperCase()}
                </span>
                Partagé par <strong className="text-texte">{deal.submitterPseudo}</strong>
              </span>
            )}
          </div>

          {/* d. Description. */}
          {deal.description && <p className="text-sm text-muted leading-snug line-clamp-2">{deal.description}</p>}
        </Link>

        {/* e. Pied de carte. */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex items-center gap-3 text-xs font-bold">
            <Link href={`${dealHref}#commentaires`} className="text-muted hover:text-rouge">
              💬 {deal.commentairesCount}
            </Link>
            <ShareButton titre={deal.titre} prixPromo={deal.prixPromo} prixNormal={deal.prixNormal} dealHref={dealHref} />
          </div>
          {deal.lien ? (
            <a
              href={deal.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="font-arabic bg-rouge text-white rounded-full px-4 py-1.5 text-sm font-bold"
            >
              شوف الدييل ↗
            </a>
          ) : (
            <Link href={dealHref} className="bg-creme text-texte rounded-full px-4 py-1.5 text-xs font-bold">
              Voir le deal
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
