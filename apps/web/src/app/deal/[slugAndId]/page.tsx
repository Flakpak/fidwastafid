import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { GET as getDealHandler } from "../../api/v1/deals/[publicId]/route.js";
import { GET as getCommentairesHandler } from "../../api/v1/deals/[publicId]/commentaires/route.js";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { SiteFooter } from "../../../components/SiteFooter.js";
import { CardVote } from "../../../components/CardVote.js";
import { ShareButton } from "../../../components/ShareButton.js";
import { UrgenceCountdown } from "../../../components/UrgenceCountdown.js";
import { Avatar } from "../../../components/Avatar.js";
import { Badge } from "../../../components/Badge.js";
import { CommentForm } from "./CommentForm.js";
import { CommentairesErreur } from "./CommentairesErreur.js";
import { lireCommentaires, type ResultatCommentaires } from "./commentaires.js";
import { dealDescription, dealJsonLd, dealOgDescription, truncateOgTitle } from "./seo.js";
import { dealTypeLabel, relativeDate, shortDate } from "../../../lib/format.js";
import { urgence } from "../../../lib/urgence.js";
import { SITE_URL } from "../../../lib/siteUrl.js";
import { fetchDealImageBytes } from "../../../lib/dealImageStorage.js";
import { imageDimensions } from "../../../lib/ogImageJpeg.js";

/** SSR par requête — mêmes raisons que la page d'accueil (voir app/page.tsx). */
export const dynamic = "force-dynamic";

type PageParams = { params: Promise<{ slugAndId: string }> };

/** CONTRAT-V1 §1 : le serveur résout UNIQUEMENT sur le dernier segment après le dernier tiret. */
function extractPublicId(param: string): string {
  const idx = param.lastIndexOf("-");
  return idx === -1 ? param : param.slice(idx + 1);
}

/** Parité avec DealCard.reduction() — même calcul, dupliqué volontairement
 *  (fonction pure de deux lignes, même pattern déjà répété dans ShareButton). */
function reduction(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

async function fetchDeal(publicId: string): Promise<Deal | null> {
  const response = await getDealHandler(new Request(`http://localhost/api/v1/deals/${publicId}`), {
    params: Promise.resolve({ publicId }),
  });
  if (response.status === 404) return null;
  return (await response.json()) as Deal;
}

function fetchCommentaires(publicId: string): Promise<ResultatCommentaires> {
  return lireCommentaires(publicId, () =>
    getCommentairesHandler(new Request(`http://localhost/api/v1/deals/${publicId}/commentaires`), {
      params: Promise.resolve({ publicId }),
    })
  );
}

/** Image OG générique du site (app/opengraph-image.tsx — mêmes valeurs que
 *  ses exports `size`/`contentType`, dupliquées ici volontairement : ce
 *  fichier de convention Next.js n'est pas fait pour être importé ailleurs). */
const IMAGE_OG_GENERIQUE = { url: new URL("/opengraph-image", SITE_URL).toString(), width: 1200, height: 630, type: "image/png" };

/**
 * og:image du deal — incident du 20/07/2026 : generateMetadata ne renseignait
 * jamais `openGraph.images`, aucune image n'apparaissait jamais dans un
 * partage (ni la photo du deal, ni le repli générique du site pourtant déjà
 * câblé). Repli sur l'image générique si le deal n'a pas de photo, ou si la
 * lecture Storage échoue (jamais casser generateMetadata pour un souci
 * d'image — cf. fetchDealImageBytes qui avale déjà ses propres erreurs).
 *
 * URL sur un chemin dédié SANS query string (`/og.jpg`, pas
 * `?format=jpeg`) — incident du 21/07/2026 : le crawler Meta fetchait
 * og:image en tronquant la query string (vérifié par curl en prod, ni la
 * route ni le cache Vercel ne perdaient le paramètre) et recevait le WebP
 * servi par défaut sur ce chemin, rejeté à l'affichage.
 *
 * Dimensions lues à la volée (imageDimensions) plutôt que stockées en base :
 * le resize à l'upload est `fit: "inside"` (ratio préservé, jamais un carré
 * forcé) donc variable par deal — pas de raccourci sans lire l'image.
 * Coût accepté : un aller-retour Storage de plus par rendu de page deal
 * (force-dynamic), pour une image de quelques dizaines à ~200 Ko.
 */
async function dealOgImages(deal: Deal): Promise<NonNullable<NonNullable<Metadata["openGraph"]>["images"]>> {
  if (!deal.imageKey) return [IMAGE_OG_GENERIQUE];

  const bytes = await fetchDealImageBytes(deal.imageKey);
  if (!bytes) return [IMAGE_OG_GENERIQUE];

  try {
    const { width, height } = await imageDimensions(bytes);
    const url = new URL(`/img/deals/${deal.publicId}/og.jpg`, SITE_URL).toString();
    return [{ url, width, height, type: "image/jpeg" }];
  } catch {
    return [IMAGE_OG_GENERIQUE];
  }
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slugAndId } = await params;
  const deal = await fetchDeal(extractPublicId(slugAndId));
  if (!deal) return { title: "Deal introuvable" };

  const canonical = `/deal/${dealUrlSlug(deal.titre, deal.publicId)}`;
  const description = dealDescription(deal);

  return {
    title: deal.titre,
    description,
    alternates: { canonical },
    openGraph: {
      siteName: "Fidwastafid",
      title: truncateOgTitle(deal.titre),
      description: dealOgDescription(deal),
      url: canonical,
      type: "website",
      images: await dealOgImages(deal),
    },
  };
}

export default async function DealPage({ params }: PageParams) {
  const { slugAndId } = await params;
  const publicId = extractPublicId(slugAndId);

  const deal = await fetchDeal(publicId);
  if (!deal) notFound();

  // 301 (équivalent moderne : redirection permanente 308) si le slug de
  // l'URL diverge du slug canonique courant — ex. titre édité depuis la
  // soumission. Le public_id, lui, ne change jamais (CONTRAT-V1 §1).
  const canonical = dealUrlSlug(deal.titre, deal.publicId);
  if (slugAndId !== canonical) {
    permanentRedirect(`/deal/${canonical}`);
  }

  const dealHref = `/deal/${canonical}`;
  const resultatCommentaires = await fetchCommentaires(deal.publicId);
  const expire = deal.statut === "expire";
  const pct = reduction(deal);
  const urg = urgence(deal);
  const aMeta = Boolean(deal.enseigneNom || deal.nomVendeur || deal.ville || urg);
  // Numéro jamais en texte dans la page (CONTRAT-V1 §4, amendement du
  // 18/07/2026) — uniquement dans le href wa.me, présent seulement si
  // whatsappContact est exposé (donc le soumetteur a consenti à sa
  // publication publique).
  const whatsappHref = deal.whatsappContact ? `https://wa.me/${deal.whatsappContact.replace(/^\+/, "")}` : null;
  const aPropos = Boolean(deal.description || deal.submitterPseudo);

  // Échappe `<` pour empêcher un titre/description soumis par un utilisateur
  // de casser hors du <script> (ex. "</script><script>...") — JSON.stringify
  // seul n'échappe pas les chevrons, nécessaires ici car le JSON est injecté
  // tel quel dans du HTML, pas juste parsé en JS.
  const jsonLd = JSON.stringify(dealJsonLd(deal, dealHref)).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="max-w-6xl mx-auto p-4 flex flex-col gap-4">
        <Link href="/" className="self-start text-sm font-bold text-ink-muted hover:text-ink">
          ← Retour au feed
        </Link>

        {/* CARTE 1 — hero du deal, référence structure Dealabs (2 colonnes,
            jamais ses couleurs — charte fidwastafid). */}
        <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(26,24,21,0.05)] overflow-hidden">
          {expire && (
            // Bandeau d'état neutre, pas funèbre — l'URL vit à vie (CONTRAT-V1 §1),
            // l'état doit juste être évident.
            <div className="bg-cold-soft text-cold text-center py-2 text-sm font-bold border-b border-border">
              Ce bon plan est expiré
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[40%_1fr]">
            {/* Fond blanc (même blanc que la carte) : les photos produit ont
                elles-mêmes un fond blanc, un panneau teinté créerait un
                rectangle visible autour de l'image. Le filet (border-b
                empilé mobile, border-r en 2 colonnes desktop) sépare la
                zone image du contenu ; l'ombre de la carte la sépare du
                fond crème de la page. */}
            <div className="bg-white border-b md:border-b-0 md:border-r border-border flex items-center justify-center p-8 md:p-10 min-h-[220px] md:min-h-[380px]">
              {deal.imageKey ? (
                // Jamais d'URL Supabase construite ici — uniquement la route
                // proxy /img/deals/[publicId] (CONTRAT-V1 §6). max-h + w-auto
                // h-auto (pas w-full) : l'image garde sa taille naturelle,
                // jamais agrandie au-delà de ses pixels d'origine.
                <img
                  src={`/img/deals/${deal.publicId}`}
                  alt={deal.titre}
                  loading="lazy"
                  className="max-w-full max-h-[380px] w-auto h-auto object-contain"
                />
              ) : (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  className="w-20 h-20 text-ink-subtle/50"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.5-3.5-4.5 4.5-2-2L3 19" />
                </svg>
              )}
            </div>

            <div className="p-5 md:p-8 flex flex-col gap-3">
              {/* a. Pilule de vote + actions. */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardVote publicId={deal.publicId} initialScore={deal.score} />
                <div className="flex items-center gap-3 text-sm font-bold">
                  <Link href={`${dealHref}#commentaires`} className="flex items-center gap-1 text-ink-muted hover:text-ink">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-4 w-4">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" />
                    </svg>
                    {deal.commentairesCount}
                  </Link>
                  <ShareButton
                    titre={deal.titre}
                    prixPromo={deal.prixPromo}
                    prixNormal={deal.prixNormal}
                    dealHref={dealHref}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-subtle font-semibold">
                Vos votes mettent en avant les meilleures لهميزات — c&apos;est un bon deal ?
              </p>

              {/* b. Publié + badges catégorie/type. */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-ink-muted">
                <span>Publié {relativeDate(deal.createdAt)}</span>
                <span className="bg-surface-subtle border border-border rounded-full px-3 py-1">
                  {deal.categorie}
                </span>
                <span className="bg-surface-subtle border border-border rounded-full px-3 py-1">
                  {dealTypeLabel(deal.type)}
                </span>
              </div>

              {/* c. Titre — pièce centrale. */}
              <h1 className="text-3xl md:text-4xl font-black leading-tight">{deal.titre}</h1>

              {/* d. Prix — en encre, sa taille le hiérarchise (charte Tadelakt). */}
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className={`text-[38px] font-black tabular-nums leading-none ${expire ? "text-ink-subtle line-through" : "text-ink"}`}>
                  {deal.prixPromo} DH
                </span>
                {deal.prixNormal && (
                  <span className="text-lg text-ink-subtle line-through font-bold tabular-nums">{deal.prixNormal} DH</span>
                )}
                {pct !== null && (
                  <span className="text-sm font-bold bg-accent-soft text-accent rounded-full px-3 py-1 tabular-nums">-{pct}%</span>
                )}
              </div>

              {/* e. Méta : enseigne/vendeur/ville/urgence. */}
              {aMeta && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-bold text-ink-muted">
                  {deal.enseigneNom ? (
                    <span>
                      Dispo. chez <strong className="text-ink">{deal.enseigneNom}</strong>
                    </span>
                  ) : (
                    deal.nomVendeur && (
                      <span>
                        Chez <strong className="text-ink">{deal.nomVendeur}</strong>
                      </span>
                    )
                  )}
                  {deal.ville && (
                    <span className="flex items-center gap-1">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-3.5 w-3.5 text-ink-subtle">
                        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {deal.ville}
                    </span>
                  )}
                  {urg?.mode === "expiree" && <Badge variant="cold">Expiré</Badge>}
                  {urg?.mode === "compte-a-rebours" && <UrgenceCountdown dateFin={deal.dateFin!} />}
                  {urg?.mode === "lointaine" && (
                    <span className="flex items-center gap-1 text-xs text-ink-subtle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-3 w-3">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      jusqu&apos;au {shortDate(deal.dateFin!)}
                    </span>
                  )}
                </div>
              )}

              {/* e-bis. Adresse/repère + lien Maps — commerces informels sans
                  enseigne curée (CONTRAT-V1 §3, amendement du 18/07/2026). */}
              {(deal.adresse || deal.lienMaps) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
                  {deal.adresse && (
                    <span className="flex items-center gap-1">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-3.5 w-3.5 text-ink-subtle">
                        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {deal.adresse}
                    </span>
                  )}
                  {deal.lienMaps && (
                    <a
                      href={deal.lienMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent font-bold hover:underline"
                    >
                      Voir sur la carte ↗
                    </a>
                  )}
                </div>
              )}

              {/* f. CTA — lien externe (principal, si présent) + WhatsApp
                  vendeur (secondaire, CONTRAT-V1 §4 amendement du 18/07/2026 :
                  visible uniquement si le soumetteur a consenti). */}
              <div className="flex flex-col sm:flex-row gap-2 mt-2">
                {deal.lien && (
                  <a
                    href={deal.lien}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-arabic flex-1 text-center bg-accent text-white rounded-2xl px-8 py-4 text-xl font-bold shadow-sm hover:bg-accent-hi transition-colors duration-[130ms] active:translate-y-px motion-reduce:transition-none"
                  >
                    شوف الدييل ↗
                  </a>
                )}
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 flex-1 text-center bg-surface border border-border-strong text-ink rounded-2xl px-8 py-4 text-base font-bold hover:bg-surface-subtle transition-colors duration-[130ms] motion-reduce:transition-none"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-4 w-4">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" />
                    </svg>
                    Contacter sur WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CARTE 2 — à propos (auteur + description), omise si ni l'un ni l'autre. */}
        {aPropos && (
          <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(26,24,21,0.05)] p-6 md:p-8 flex flex-col gap-4">
            <h2 className="text-lg font-black">À propos de ce deal</h2>

            {deal.submitterPseudo && (
              <div className="flex items-center gap-3">
                <Avatar pseudo={deal.submitterPseudo} couleurAvatar={deal.submitterCouleurAvatar} size="lg" />
                <p className="text-sm font-semibold text-ink-muted">
                  Partagé par <strong className="text-ink">{deal.submitterPseudo}</strong>
                </p>
              </div>
            )}

            {deal.description && (
              // whitespace-pre-line : les descriptions du pipeline contiennent
              // des \n structurés (champs "Marque:", "Numéro..." etc.), ils
              // doivent rester visibles tels quels.
              <p className="text-[15px] text-ink leading-relaxed whitespace-pre-line">{deal.description}</p>
            )}

            {deal.lien && (
              <a
                href={deal.lien}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="self-start text-accent font-bold hover:underline"
              >
                Plus de détails{deal.enseigneNom ? ` sur ${deal.enseigneNom}` : ""} ↗
              </a>
            )}
          </div>
        )}

        {/* CARTE 3 — commentaires. */}
        <section id="commentaires" className="bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(26,24,21,0.05)] p-6 md:p-8 flex flex-col gap-4">
          {/* Le compteur du titre vient du deal (sous-requête count(*) de
              DEAL_SELECT), pas de la longueur de la liste : il reste juste même
              quand la liste, elle, n'a pas pu être chargée. Même source qu'en
              haut de page — deux compteurs divergents seraient un bug visible. */}
          <h2 className="text-lg font-black">Commentaires ({deal.commentairesCount})</h2>
          <CommentForm publicId={deal.publicId} />
          {!resultatCommentaires.ok ? (
            <CommentairesErreur />
          ) : resultatCommentaires.commentaires.length === 0 ? (
            <p className="text-ink-muted text-sm border-t border-border pt-3">
              Aucun commentaire pour l&apos;instant. Sois le premier.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {resultatCommentaires.commentaires.map((c) => (
                <li key={c.createdAt} className="flex gap-2.5 border-t border-border pt-3 text-sm">
                  <Avatar pseudo={c.pseudo} couleurAvatar={c.couleurAvatar} size="md" />
                  <div>
                    <p className="font-black text-ink text-xs mb-0.5">{c.pseudo}</p>
                    <p className="text-ink-muted">{c.contenu}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
