import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { dealUrlSlug, type Deal } from "@fidwastafid/schemas";
import { GET as getDealHandler } from "../../api/v1/deals/[publicId]/route.js";
import { GET as getCommentairesHandler } from "../../api/v1/deals/[publicId]/commentaires/route.js";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { SiteFooter } from "../../../components/SiteFooter.js";
import { DealActions } from "./DealActions.js";
import { CommentForm } from "./CommentForm.js";
import { dealDescription, dealJsonLd } from "./seo.js";
import { joinMeta } from "../../../lib/format.js";

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

  // Échappe `<` pour empêcher un titre/description soumis par un utilisateur
  // de casser hors du <script> (ex. "</script><script>...") — JSON.stringify
  // seul n'échappe pas les chevrons, nécessaires ici car le JSON est injecté
  // tel quel dans du HTML, pas juste parsé en JS.
  const jsonLd = JSON.stringify(dealJsonLd(deal, `/deal/${canonical}`)).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        {expire && (
          <div className="bg-white border border-bordure rounded-lg p-3 text-sm font-bold text-muted text-center">
            Ce bon plan est expiré.
          </div>
        )}

        <div className="bg-white border border-bordure rounded-xl p-5 flex flex-col gap-3">
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
              className="self-start max-w-full max-h-56 w-auto h-auto rounded-lg"
            />
          )}
          <div className="text-xs font-bold text-muted">{joinMeta(deal.enseigneSlug, deal.ville)}</div>
          <h1 className="text-2xl font-black leading-snug">{deal.titre}</h1>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-black text-rouge">{deal.prixPromo} DH</span>
            {deal.prixNormal && <span className="text-muted line-through">{deal.prixNormal} DH</span>}
          </div>
          {deal.description && <p className="text-sm text-muted leading-relaxed">{deal.description}</p>}
          {!expire && deal.dateFin && (
            <div className="bg-creme border border-bordure rounded-lg px-3 py-2 text-sm font-bold text-muted">
              ⏰ Valable jusqu&apos;au{" "}
              {new Date(deal.dateFin).toLocaleDateString("fr-MA", { day: "numeric", month: "long" })}
            </div>
          )}
          {deal.lien && (
            <a
              href={deal.lien}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="self-start bg-bleu text-white rounded-lg px-5 py-2 font-bold"
            >
              Voir l&apos;offre
            </a>
          )}
          <DealActions deal={deal} />
        </div>

        <section className="bg-white border border-bordure rounded-xl p-5 flex flex-col gap-4">
          <h2 className="font-bold">Commentaires ({commentaires.length})</h2>
          <CommentForm publicId={deal.publicId} />
          <ul className="flex flex-col gap-3">
            {commentaires.map((c) => (
              <li key={c.createdAt} className="border-t border-bordure pt-3 text-sm">
                <span className="font-bold">{c.auteurPublicId}</span>
                <p className="text-muted">{c.contenu}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
