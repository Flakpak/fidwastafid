import Link from "next/link";
import type { Deal } from "@fidwastafid/schemas";
import { SiteHeader } from "./SiteHeader.js";
import { SiteFooter } from "./SiteFooter.js";
import { DealCard } from "./DealCard.js";
import { FilAriane } from "./FilAriane.js";
import type { MaillonAriane } from "../lib/hubs.js";
import { resolveCurrentUser } from "../lib/currentUser.js";
import { fetchMesVotes } from "../app/api/v1/_lib/votes.js";

export interface LienHub {
  href: string;
  libelle: string;
  nombre?: number;
}

/**
 * Gabarit commun des pages hub (/categorie/[slug], /bons-plans/[evenement]) —
 * même rendu de liste que /enseigne/[slug] (DealCard, état voté SSR).
 */
export async function HubPage({
  maillons,
  h1,
  intro,
  darija,
  deals,
  vide,
  liens,
  titreLiens,
  note,
}: {
  maillons: readonly MaillonAriane[];
  h1: string;
  intro: string;
  darija: string | null;
  /** Phrase affichée sous l'intro (ex. édition qui démarre). */
  note?: string | null;
  deals: Deal[];
  vide: string;
  liens: LienHub[];
  titreLiens: string;
}) {
  const utilisateurCourant = await resolveCurrentUser();
  const mesVotes = utilisateurCourant
    ? await fetchMesVotes(
        utilisateurCourant.id,
        deals.map((d) => d.publicId)
      )
    : {};

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-3">
        <FilAriane maillons={maillons} />
        <h1 className="text-2xl font-black">{h1}</h1>
        {/* Bloc darija (CONTRAT-V1 §3, vingt-deuxième amendement) : `lang` et
            `dir` posés sur le bloc lui-même, la page reste en français. */}
        {darija && (
          <p lang="ar-MA" dir="rtl" className="font-arabic text-lg text-ink">
            {darija}
          </p>
        )}
        <p className="text-ink-muted leading-relaxed">{intro}</p>
        {note && <p className="font-bold text-ink">{note}</p>}

        {deals.length === 0 && <p className="text-center text-ink-muted py-16">{vide}</p>}
        {deals.map((deal) => (
          <DealCard
            key={deal.publicId}
            deal={deal}
            monVote={utilisateurCourant ? (mesVotes[deal.publicId] ?? null) : undefined}
          />
        ))}

        {liens.length > 0 && (
          <section aria-labelledby="hub-liens" className="mt-6 flex flex-col gap-2">
            <h2 id="hub-liens" className="text-lg font-black">
              {titreLiens}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {liens.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-sm font-bold hover:border-border-strong"
                  >
                    {l.libelle}
                    {l.nombre !== undefined && <span className="ml-1 text-ink-muted font-normal">({l.nombre})</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
