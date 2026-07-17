import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { GET as getDealHandler } from "../../api/v1/deals/[publicId]/route.js";
import { GET as getCommentairesHandler } from "../../api/v1/deals/[publicId]/commentaires/route.js";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { SiteFooter } from "../../../components/SiteFooter.js";
import { DealActions } from "./DealActions.js";
import { CommentForm } from "./CommentForm.js";
import { dealDescription, dealJsonLd } from "./seo.js";
import { categorieIcon, dealTypeLabel, relativeDate } from "../../../lib/format.js";

/** SSR par requête — mêmes raisons que la page d'accueil (voir app/page.tsx). */
export const dynamic = "force-dynamic";

interface Commentaire {
  contenu: string;
  auteurPublicId: string;
  pseudo: string;
  createdAt: string;
}

type PageParams = { params: Promise<{ slugAndId: string }> };

/** CONTRAT-V1 §1 : le serveur résout UNIQUEMENT sur le dernier segment après le dernier tiret. */
function extractPublicId(param: string): string {
  const idx = param.lastIndexOf("-");
  return idx === -1 ? param : param.slice(idx + 1);
}

/** Parité avec DealCard.reduction() — même calcul, dupliqué volontairement
 *  (fonction pure de deux lignes, même pattern déjà répété dans DealActions.share()). */
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

  const commentaires = await fetchCommentaires(deal.publicId);
  const expire = deal.statut === "expire";
  const pct = reduction(deal);
  const aMeta = Boolean(deal.enseigneNom || deal.ville || (!expire && deal.dateFin));

  // Échappe `<` pour empêcher un titre/description soumis par un utilisateur
  // de casser hors du <script> (ex. "</script><script>...") — JSON.stringify
  // seul n'échappe pas les chevrons, nécessaires ici car le JSON est injecté
  // tel quel dans du HTML, pas juste parsé en JS.
  const jsonLd = JSON.stringify(dealJsonLd(deal, `/deal/${canonical}`)).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
        {expire && (
          <div className="bg-white border border-bordure rounded-lg p-3 text-sm font-bold text-muted text-center">
            Ce bon plan est expiré.
          </div>
        )}

        <div className="bg-white border border-bordure rounded-xl overflow-hidden flex flex-col">
          {/* Bandeau haut : retour au feed + date de publication relative
              (référence v1 deal-detail-topbar, index.html racine). */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-bordure bg-creme text-sm">
            <Link href="/" className="font-bold text-muted hover:text-rouge">
              ← Retour au feed
            </Link>
            <span className="font-semibold text-muted">Publié {relativeDate(deal.createdAt)}</span>
          </div>

          {/* Layout 2 colonnes desktop (image ~45% | contenu), empilé mobile
              — référence v1 deal-detail-layout. */}
          <div className="grid grid-cols-1 md:grid-cols-[45%_1fr]">
            <div className="bg-creme flex items-center justify-center p-8 border-b md:border-b-0 md:border-r border-bordure min-h-[200px] md:min-h-[340px]">
              {deal.imageKey ? (
                // Jamais d'URL Supabase construite ici — uniquement la route
                // proxy /img/deals/[publicId] (CONTRAT-V1 §6). max-h + w-auto
                // h-auto (pas w-full) : l'image garde sa taille naturelle,
                // jamais agrandie au-delà de ses pixels d'origine.
                <img
                  src={`/img/deals/${deal.publicId}`}
                  alt={deal.titre}
                  loading="lazy"
                  className="max-w-full max-h-[340px] w-auto h-auto object-contain"
                />
              ) : (
                // Placeholder catégorie grand format, faible opacité —
                // référence v1 deal-detail-img-placeholder.
                <span aria-hidden="true" className="text-8xl opacity-10">
                  {categorieIcon(deal.categorie)}
                </span>
              )}
            </div>

            <div className="p-5 md:p-9 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
                <span className="bg-creme border border-bordure rounded-full px-3 py-1">
                  {categorieIcon(deal.categorie)} {deal.categorie}
                </span>
                <span className="bg-creme border border-bordure rounded-full px-3 py-1">
                  {dealTypeLabel(deal.type)}
                </span>
              </div>

              <h1 className="text-xl md:text-2xl font-black leading-snug">{deal.titre}</h1>

              {deal.submitterPseudo && (
                <p className="text-xs text-muted font-semibold">
                  Partagé par <strong className="text-texte">{deal.submitterPseudo}</strong>
                </p>
              )}

              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl md:text-4xl font-black text-rouge">{deal.prixPromo} DH</span>
                {deal.prixNormal && <span className="text-muted line-through font-bold">{deal.prixNormal} DH</span>}
                {pct !== null && <span className="text-sm font-bold bg-rouge text-white rounded px-3 py-1">-{pct}%</span>}
              </div>

              {aMeta && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-muted">
                  {deal.enseigneNom && (
                    <span>
                      Dispo. chez <strong className="text-texte">{deal.enseigneNom}</strong>
                    </span>
                  )}
                  {deal.ville && <span>📍 {deal.ville}</span>}
                  {!expire && deal.dateFin && (
                    <span>
                      ⏰ Valable jusqu&apos;au{" "}
                      {new Date(deal.dateFin).toLocaleDateString("fr-MA", { day: "numeric", month: "long" })}
                    </span>
                  )}
                </div>
              )}

              {deal.description && (
                <div className="bg-creme border border-bordure border-l-4 border-l-orange rounded-r-lg px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-orange mb-1.5">
                    ℹ️ Infos du deal
                  </p>
                  <p className="text-sm text-texte font-semibold leading-relaxed">{deal.description}</p>
                </div>
              )}

              {deal.lien && (
                <a
                  href={deal.lien}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-arabic self-start bg-bleu text-white rounded-xl px-8 py-3.5 text-lg font-bold"
                >
                  شوف الدييل ↗
                </a>
              )}
            </div>
          </div>

          {/* Barre de vote — référence v1 deal-detail-votes-label. */}
          <div className="flex items-center gap-3.5 flex-wrap px-5 py-4 border-t border-bordure bg-creme">
            <p className="flex-1 min-w-[200px] text-sm font-bold">
              Vos votes mettent en avant les meilleures لهميزات — c&apos;est un bon deal ?
            </p>
            <DealActions deal={deal} />
          </div>
        </div>

        <section id="commentaires" className="bg-white border border-bordure rounded-xl p-5 flex flex-col gap-4">
          <h2 className="font-bold">Commentaires ({commentaires.length})</h2>
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
