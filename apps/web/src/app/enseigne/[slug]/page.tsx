import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Deal, Enseigne } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "../../api/v1/deals/route.js";
import { GET as getEnseignesHandler } from "../../api/v1/enseignes/route.js";
import { SiteHeader } from "../../../components/SiteHeader.js";
import { DealCard } from "../../../components/DealCard.js";

/** SSR par requête — mêmes raisons que le feed (voir app/page.tsx). */
export const dynamic = "force-dynamic";

type PageParams = { params: Promise<{ slug: string }> };

async function fetchEnseigne(slug: string): Promise<Enseigne | null> {
  const response = await getEnseignesHandler();
  const body = (await response.json()) as { data: Enseigne[] };
  return body.data.find((e) => e.slug === slug) ?? null;
}

async function fetchDeals(slug: string): Promise<Deal[]> {
  const response = await getDealsHandler(
    new Request(`http://localhost/api/v1/deals?enseigne=${encodeURIComponent(slug)}&limit=24`)
  );
  const body = (await response.json()) as { data: Deal[] };
  return body.data;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const enseigne = await fetchEnseigne(slug);
  if (!enseigne) return { title: "Enseigne introuvable" };

  const description = `Tous les bons plans et promotions ${enseigne.nom} au Maroc, votés par la communauté.`;
  const canonical = `/enseigne/${enseigne.slug}`;

  return {
    title: enseigne.nom,
    description,
    alternates: { canonical },
    openGraph: { title: enseigne.nom, description, url: canonical, type: "website" },
  };
}

export default async function EnseignePage({ params }: PageParams) {
  const { slug } = await params;
  const enseigne = await fetchEnseigne(slug);
  if (!enseigne) notFound();

  const deals = await fetchDeals(slug);

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />

      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-3">
        <h1 className="text-xl font-black">{enseigne.nom}</h1>
        {deals.length === 0 && (
          <p className="text-center text-muted py-16">Aucun bon plan pour {enseigne.nom} pour l&apos;instant.</p>
        )}
        {deals.map((deal) => (
          <DealCard key={deal.publicId} deal={deal} />
        ))}
      </main>
    </div>
  );
}
