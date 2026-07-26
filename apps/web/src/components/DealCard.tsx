import Link from "next/link";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { relativeDate, shortDate } from "../lib/format.js";
import { urgence } from "../lib/urgence.js";
import { SEUIL_CHAUD } from "../lib/score.js";
import { CardVote } from "./CardVote.js";
import { UrgenceCountdown } from "./UrgenceCountdown.js";
import { ShareButton } from "./ShareButton.js";
import { Avatar } from "./Avatar.js";
import { Badge } from "./Badge.js";
import { buttonClasses } from "./Button.js";

function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/**
 * Économie en dirhams, calculée depuis les données — jamais une valeur écrite
 * en dur.
 *
 * Renvoie `null` dès que le prix de référence est absent, nul ou incohérent
 * (inférieur ou égal au prix courant). Dans ce cas l'appelant n'affiche RIEN :
 * ni zéro, ni tiret. Annoncer une fausse économie serait pire que de ne rien
 * annoncer — c'est la promesse de fiabilité des prix qui se joue là.
 */
function economie(deal: Deal): number | null {
  if (deal.prixNormal === undefined || deal.prixNormal === null) return null;
  if (!Number.isFinite(deal.prixNormal) || !Number.isFinite(deal.prixPromo)) return null;
  if (deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((deal.prixNormal - deal.prixPromo) * 100) / 100;
}

/**
 * Carte deal — structure Dealabs (2 colonnes fixes, pilule de vote, CTA
 * proéminent) restylée charte Tadelakt (CONTRAT-V1 §8). Reste un composant
 * serveur (feed SSR, Phase 4) : les boutons de vote (CardVote), le compte à
 * rebours (UrgenceCountdown) et le partage (ShareButton) sont les seuls îlots
 * client, isolés.
 *
 * Tadelakt : fond `surface`, filet `border`, rayon 11px, ombre à peine
 * perceptible ; le prix n'est plus coloré (sa taille le hiérarchise) ; le
 * SEUL élément décoratif est le liseré gauche `hot` d'un deal chaud, et il
 * encode une information réelle (score ≥ seuil). Icônes en trait (Lucide
 * absent du projet — SVG en ligne, la voie de repli prévue).
 *
 * Contrainte HTML : aucun élément interactif ne peut être imbriqué dans un
 * <Link> — la pilule de vote et le pied de carte (liens/boutons) vivent
 * donc hors des <Link> qui couvrent l'image et le bloc titre/prix/description.
 */
export function DealCard({ deal }: { deal: Deal }) {
  const pct = reduction(deal);
  const gain = economie(deal);
  const dealHref = `/deal/${dealUrlSlug(deal.titre, deal.publicId)}`;
  const isHot = deal.score >= SEUIL_CHAUD;
  const urg = urgence(deal);

  return (
    <div
      className={`group flex flex-row overflow-hidden rounded-[11px] border border-border bg-surface shadow-[0_1px_2px_rgba(26,24,21,0.05)] transition-[border-color,box-shadow,transform] duration-[140ms] hover:-translate-y-px hover:border-accent-line hover:shadow-[0_4px_14px_rgba(26,24,21,0.09)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        isHot ? "border-l-[3px] border-l-hot" : ""
      }`}
    >
      {/* Colonne image — largeur fixe, la carte reste 2 colonnes même en
          mobile. Fond blanc (même blanc que la carte) : les photos produit
          ont elles-mêmes un fond blanc, un panneau teinté créerait un
          rectangle visible autour de l'image. Le filet vertical (border-r)
          sépare la zone image du contenu. */}
      <Link
        href={dealHref}
        className="w-[110px] md:w-[180px] shrink-0 self-stretch flex items-center justify-center p-3 bg-white border-r border-border"
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
          // Placeholder « pas d'image » — icône en trait neutre (plus l'emoji
          // de catégorie de la v1), la catégorie reste lisible dans la méta.
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            className="w-9 h-9 text-ink-subtle/60"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.5-3.5-4.5 4.5-2-2L3 19" />
          </svg>
        )}
      </Link>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5 p-3">
        {/* a. Ligne haute : pilule de vote + urgence/tendance. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardVote publicId={deal.publicId} initialScore={deal.score} />
            {isHot && (
              <Badge variant="hot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="w-3 h-3">
                  <path d="m6 15 6-6 6 6" />
                  <path d="M4 20h16" />
                </svg>
                Tendance
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-subtle">{relativeDate(deal.createdAt)}</span>
            {/* État expiré : registre glacé (maquette). `cold` sort ici de la
                seule température de vote — usage signalé (cf. rapport). */}
            {urg?.mode === "expiree" && <Badge variant="cold">Expiré</Badge>}
            {urg?.mode === "compte-a-rebours" && <UrgenceCountdown dateFin={deal.dateFin!} />}
            {urg?.mode === "lointaine" && (
              <span className="flex items-center gap-1 text-xs text-ink-subtle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="w-3 h-3">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                jusqu&apos;au {shortDate(deal.dateFin!)}
              </span>
            )}
          </div>
        </div>

        {/* `group/lien` : le focus clavier atterrit sur CE lien, pas sur la carte
            (un <div> n'est pas focusable) — sans ce groupe nommé, la variante
            focus-visible ne se déclencherait jamais. Le survol reste porté par
            le `group` de la carte entière. */}
        <Link href={dealHref} className="group/lien flex flex-col gap-1.5 rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {/* b. Titre — affordance de clic : le soulignement est retiré (lot 6)
              au profit d'un passage en `accent`, au survol ET au focus clavier.
              Sans le second, l'affordance disparaîtrait pour qui navigue au
              clavier, où l'ombre de la carte ne dit rien. */}
          <h2 className="font-bold text-base leading-snug line-clamp-2 text-ink transition-colors duration-[130ms] motion-reduce:transition-none group-hover:text-accent group-focus-visible/lien:text-accent">
            {deal.titre}
          </h2>

          {/* c. Prix + confiance. Le prix reste en ENCRE : dans ce système
              `accent` dit « cliquable » et `hot` dit « deal chaud » — un prix
              vert passerait pour un lien, un prix braise pour une température.
              La hiérarchie passe donc par la masse (30px, graisse 700), pas par
              la teinte. La pastille de remise, elle, est l'ancre colorée. */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[30px] font-bold text-ink tabular-nums leading-none tracking-[-0.035em]">
              {deal.prixPromo}
              <span className="text-[15px] font-medium tracking-normal text-ink-subtle"> DH</span>
            </span>
            {deal.prixNormal && (
              <span className="text-[15px] font-medium text-ink-subtle line-through tabular-nums">
                {deal.prixNormal} DH
              </span>
            )}
            {pct !== null && (
              <span className="rounded-[4px] bg-accent px-2 py-[3px] text-xs font-semibold text-white tabular-nums">
                -{pct}%
              </span>
            )}
            {(deal.enseigneNom || deal.nomVendeur || deal.ville) && (
              <span aria-hidden="true" className="w-px h-3 bg-border" />
            )}
            {deal.enseigneNom ? (
              <span className="text-ink-muted">
                Dispo. chez <strong className="text-ink">{deal.enseigneNom}</strong>
              </span>
            ) : (
              deal.nomVendeur && (
                <span className="text-ink-muted">
                  Chez <strong className="text-ink">{deal.nomVendeur}</strong>
                </span>
              )
            )}
            {deal.ville && (
              <span className="flex items-center gap-1 text-ink-muted">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="w-3 h-3 text-ink-subtle">
                  <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                {deal.ville}
              </span>
            )}
            {deal.submitterPseudo && (
              <span className="flex items-center gap-1 text-ink-muted">
                <Avatar pseudo={deal.submitterPseudo} couleurAvatar={deal.submitterCouleurAvatar} size="sm" />
                Partagé par <strong className="text-ink">{deal.submitterPseudo}</strong>
              </span>
            )}
          </div>

          {/* c-bis. Économie en dirhams — un pourcentage demande un calcul
              mental, un montant est directement comparable à ce qu'on a en
              poche. Affichée UNIQUEMENT si le prix de référence existe et
              dépasse le prix courant (cf. `economie`) : jamais de zéro, jamais
              de tiret, rien du tout. */}
          {gain !== null && (
            <p className="text-[11.5px] font-medium text-accent">Tu économises {gain} DH</p>
          )}

          {/* d. Description. */}
          {deal.description && <p className="text-[12.5px] text-ink-subtle leading-snug line-clamp-2">{deal.description}</p>}
        </Link>

        {/* e. Pied de carte. */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <div className="flex items-center gap-3 text-xs font-bold">
            <Link href={`${dealHref}#commentaires`} className="flex items-center gap-1 text-ink-muted hover:text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="w-3.5 h-3.5">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" />
              </svg>
              {deal.commentairesCount}
            </Link>
            <ShareButton titre={deal.titre} prixPromo={deal.prixPromo} prixNormal={deal.prixNormal} dealHref={dealHref} />
          </div>
          {deal.lien ? (
            <a
              href={deal.lien}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "primary", size: "sm", arabic: true })}
            >
              شوف الدييل ↗
            </a>
          ) : (
            <Link href={dealHref} className={buttonClasses({ variant: "primary", size: "sm" })}>
              Voir le deal
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
