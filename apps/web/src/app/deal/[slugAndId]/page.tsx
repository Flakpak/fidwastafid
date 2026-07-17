import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { dealUrlSlug, type Deal, type Commentaire } from "@fidwastafid/schemas";
import { GET as getDealHandler } from "../../api/v1/deals/[publicId]/route.js";
import { GET as getCommentairesHandler } from "../../api/v1/deals/[publicId]/commentaires/route.js";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { SiteFooter } from "../../../components/SiteFooter.js";
import { CardVote } from "../../../components/CardVote.js";
import { ShareButton } from "../../../components/ShareButton.js";
import { UrgenceCountdown } from "../../../components/UrgenceCountdown.js";
import { CommentForm } from "./CommentForm.js";
import { dealDescription, dealJsonLd } from "./seo.js";
import { categorieIcon, dealTypeLabel, relativeDate, shortDate } from "../../../lib/format.js";
import { urgence } from "../../../lib/urgence.js";

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

async function fetchCommentaires(publicId: string): Promise<Commentaire[]> {
  const response = await getCommentairesHandler(
    new Request(`http://localhost/api/v1/deals/${publicId}/commentaires`),
    { params: Promise.resolve({ publicId }) }
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { data: Commentaire[] };
  return body.data;
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
    openGraph: { title: deal.titre, description, url: canonical, type: "website" },
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
  const commentaires = await fetchCommentaires(deal.publicId);
  const expire = deal.statut === "expire";
  const pct = reduction(deal);
  const urg = urgence(deal);
  const aMeta = Boolean(deal.enseigneNom || deal.ville || urg);
  const aPropos = Boolean(deal.description || deal.submitterPseudo);

  // Échappe `<` pour empêcher un titre/description soumis par un utilisateur
  // de casser hors du <script> (ex. "</script><script>...") — JSON.stringify
  // seul n'échappe pas les chevrons, nécessaires ici car le JSON est injecté
  // tel quel dans du HTML, pas juste parsé en JS.
  const jsonLd = JSON.stringify(dealJsonLd(deal, dealHref)).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="max-w-6xl mx-auto p-4 flex flex-col gap-4">
        <Link href="/" className="self-start text-sm font-bold text-muted hover:text-rouge">
          ← Retour au feed
        </Link>

        {/* CARTE 1 — hero du deal, référence structure Dealabs (2 colonnes,
            jamais ses couleurs — charte fidwastafid). */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          {expire && (
            // Bandeau d'état neutre, pas funèbre — l'URL vit à vie (CONTRAT-V1 §1),
            // l'état doit juste être évident.
            <div className="bg-creme text-muted text-center py-2 text-sm font-bold border-b border-bordure">
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
            <div className="bg-white border-b md:border-b-0 md:border-r border-bordure flex items-center justify-center p-8 md:p-10 min-h-[220px] md:min-h-[380px]">
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
                <span aria-hidden="true" className="text-8xl opacity-15">
                  {categorieIcon(deal.categorie)}
                </span>
              )}
            </div>

            <div className="p-5 md:p-8 flex flex-col gap-3">
              {/* a. Pilule de vote + actions. */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardVote publicId={deal.publicId} initialScore={deal.score} />
                <div className="flex items-center gap-3 text-sm font-bold">
                  <Link href={`${dealHref}#commentaires`} className="text-muted hover:text-rouge">
                    💬 {deal.commentairesCount}
                  </Link>
                  <ShareButton
                    titre={deal.titre}
                    prixPromo={deal.prixPromo}
                    prixNormal={deal.prixNormal}
                    dealHref={dealHref}
                  />
                </div>
              </div>
              <p className="text-xs text-muted font-semibold">
                Vos votes mettent en avant les meilleures لهميزات — c&apos;est un bon deal ?
              </p>

              {/* b. Publié + badges catégorie/type. */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold text-muted">
                <span>Publié {relativeDate(deal.createdAt)}</span>
                <span className="bg-creme border border-bordure rounded-full px-3 py-1">
                  {categorieIcon(deal.categorie)} {deal.categorie}
                </span>
                <span className="bg-creme border border-bordure rounded-full px-3 py-1">
                  {dealTypeLabel(deal.type)}
                </span>
              </div>

              {/* c. Titre — pièce centrale. */}
              <h1 className="text-3xl md:text-4xl font-black leading-tight">{deal.titre}</h1>

              {/* d. Prix. */}
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-4xl md:text-5xl font-black text-rouge">{deal.prixPromo} DH</span>
                {deal.prixNormal && (
                  <span className="text-lg text-muted line-through font-bold">{deal.prixNormal} DH</span>
                )}
                {pct !== null && (
                  <span className="text-sm font-bold bg-vert/10 text-vert rounded-full px-3 py-1">-{pct}%</span>
                )}
              </div>

              {/* e. Méta : enseigne/ville/urgence. */}
              {aMeta && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-bold text-muted">
                  {deal.enseigneNom && (
                    <span>
                      Dispo. chez <strong className="text-texte">{deal.enseigneNom}</strong>
                    </span>
                  )}
                  {deal.ville && <span>📍 {deal.ville}</span>}
                  {urg?.mode === "expiree" && (
                    <span className="text-xs font-bold bg-creme text-muted rounded-full px-2.5 py-1">Expiré</span>
                  )}
                  {urg?.mode === "compte-a-rebours" && <UrgenceCountdown dateFin={deal.dateFin!} />}
                  {urg?.mode === "lointaine" && (
                    <span className="text-xs text-muted">⏰ jusqu&apos;au {shortDate(deal.dateFin!)}</span>
                  )}
                </div>
              )}

              {/* f. CTA proéminent — uniquement si lien externe (on est déjà sur la page du deal). */}
              {deal.lien && (
                <a
                  href={deal.lien}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-arabic w-full text-center bg-rouge text-white rounded-2xl px-8 py-4 text-xl font-bold mt-2"
                >
                  شوف الدييل ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* CARTE 2 — à propos (auteur + description), omise si ni l'un ni l'autre. */}
        {aPropos && (
          <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-4">
            <h2 className="text-lg font-black">À propos de ce deal</h2>

            {deal.submitterPseudo && (
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-rouge to-orange text-white flex items-center justify-center text-sm font-black"
                >
                  {deal.submitterPseudo[0]?.toUpperCase()}
                </span>
                <p className="text-sm font-semibold text-muted">
                  Partagé par <strong className="text-texte">{deal.submitterPseudo}</strong>
                </p>
              </div>
            )}

            {deal.description && (
              // whitespace-pre-line : les descriptions du pipeline contiennent
              // des \n structurés (champs "Marque:", "Numéro..." etc.), ils
              // doivent rester visibles tels quels.
              <p className="text-[15px] text-texte leading-relaxed whitespace-pre-line">{deal.description}</p>
            )}

            {deal.lien && (
              <a
                href={deal.lien}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="self-start text-bleu font-bold hover:underline"
              >
                Plus de détails{deal.enseigneNom ? ` sur ${deal.enseigneNom}` : ""} ↗
              </a>
            )}
          </div>
        )}

        {/* CARTE 3 — commentaires. */}
        <section id="commentaires" className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-4">
          <h2 className="text-lg font-black">Commentaires ({commentaires.length})</h2>
          <CommentForm publicId={deal.publicId} />
          <ul className="flex flex-col gap-3">
            {commentaires.map((c) => (
              <li key={c.createdAt} className="flex gap-2.5 border-t border-bordure pt-3 text-sm">
                {/* Avatar cercle coloré à initiale — référence v1 user-avatar. */}
                <span
                  aria-hidden="true"
                  className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-rouge to-orange text-white flex items-center justify-center text-xs font-black"
                >
                  {c.pseudo[0]?.toUpperCase()}
                </span>
                <div>
                  <p className="font-black text-rouge text-xs mb-0.5">{c.pseudo}</p>
                  <p className="text-muted">{c.contenu}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
