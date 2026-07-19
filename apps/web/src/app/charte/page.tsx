import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";

const DESCRIPTION =
  "Ce qui est un bon plan sur Fidwastafid, ce qui ne l'est pas, et comment la modération valide chaque soumission.";

export const metadata: Metadata = {
  title: "Charte de publication",
  description: DESCRIPTION,
  alternates: { canonical: "/charte" },
  openGraph: { title: "Charte de publication — Fidwastafid", description: DESCRIPTION, url: "/charte" },
};

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-black">{titre}</h2>
      <div className="text-sm text-muted leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default function ChartePage() {
  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Charte de publication</h1>
            <p className="text-sm text-muted">
              Un bon plan Fidwastafid, c&apos;est une offre d&apos;un commerce, accessible à tous au même prix.
              Cette page explique simplement ce qui est accepté, ce qui ne l&apos;est pas, et comment la
              modération valide chaque soumission.
            </p>
          </div>

          <Section titre="Le critère">
            <p>
              Avant de publier, on se pose une seule question :{" "}
              <strong className="text-texte">
                n&apos;importe qui peut-il obtenir la même offre au même prix ?
              </strong>{" "}
              Si oui, c&apos;est un bon plan. Si l&apos;offre dépend de qui tu es, de ce que tu possèdes, ou
              qu&apos;elle n&apos;est valable qu&apos;une fois entre deux personnes précises, ce n&apos;est pas
              un bon plan.
            </p>
          </Section>

          <Section titre="Ce qui est accepté">
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>une promotion, un prix cassé ou une offre d&apos;une enseigne (Marjane, BIM, Jumia, etc.) ;</li>
              <li>
                une offre d&apos;un commerce informel — hanout, étal de marché, boutique de quartier sans
                enseigne — du moment que c&apos;est un commerce qui vend à tout le monde au même prix ;
              </li>
              <li>
                une offre d&apos;un vendeur professionnel joignable par WhatsApp, tant que le prix et le produit
                sont les mêmes pour n&apos;importe quel acheteur.
              </li>
            </ul>
          </Section>

          <Section titre="Ce qui n'est pas accepté">
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>
                une vente entre particuliers (revendre un objet personnel, d&apos;occasion, ou négocié au cas
                par cas) ;
              </li>
              <li>
                une annonce personnelle (recherche d&apos;emploi, d&apos;appartement, de covoiturage,
                petites annonces en tout genre) ;
              </li>
              <li>
                de l&apos;auto-promotion déguisée en bon plan (mettre en avant son propre commerce ou service
                sans qu&apos;il y ait de réelle offre/réduction accessible à tous).
              </li>
            </ul>
          </Section>

          <Section titre="La modération">
            <p>
              Chaque soumission est vérifiée par la modération avant publication — jamais automatique. Un deal
              peut être rejeté (offre invérifiable, hors charte, doublon...) ; dans ce cas, un motif est
              enregistré et reste visible par le soumetteur dans{" "}
              <Link href="/compte" className="text-bleu font-bold hover:underline">
                son compte
              </Link>
              , sous « Mes contributions ».
            </p>
          </Section>

          <Section titre="Contact vendeur (WhatsApp)">
            <p>
              Un soumetteur peut ajouter le numéro WhatsApp du vendeur pour faciliter le contact — il reste
              visible uniquement par la modération, sauf consentement explicite à son affichage public au
              moment de la soumission. Détails :{" "}
              <Link href="/confidentialite" className="text-bleu font-bold hover:underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </Section>

          <p className="text-sm text-muted">
            Une question sur une modération, ou un deal qui ne respecte pas cette charte ?{" "}
            <Link href="/contact" className="text-bleu font-bold hover:underline">
              Contacte-nous
            </Link>
            .
          </p>

          <div className="pt-2">
            <Link href="/soumettre" className="inline-block bg-rouge text-white rounded-xl px-6 py-3 text-sm font-black">
              Proposer un bon plan →
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
