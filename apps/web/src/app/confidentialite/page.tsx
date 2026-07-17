import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";

const DESCRIPTION =
  "Quelles données Fidwastafid conserve, pourquoi, et comment exercer tes droits d'accès, de rectification et d'effacement (loi 09-08).";

export const metadata: Metadata = {
  title: "Confidentialité",
  description: DESCRIPTION,
  alternates: { canonical: "/confidentialite" },
  openGraph: { title: "Confidentialité — Fidwastafid", description: DESCRIPTION, url: "/confidentialite" },
};

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-black">{titre}</h2>
      <div className="text-sm text-muted leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Confidentialité</h1>
            <p className="text-sm text-muted">
              Cette page explique simplement quelles données Fidwastafid conserve à ton sujet, pourquoi, et
              comment garder la main dessus.
            </p>
          </div>

          <Section titre="Données collectées">
            <p>Uniquement ce qui est nécessaire au fonctionnement du compte et de la communauté :</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>ton email, utilisé pour te connecter — jamais affiché publiquement ;</li>
              <li>ton pseudo et la couleur de ton avatar, affichés à côté de tes contributions ;</li>
              <li>l&apos;historique de tes contributions (deals partagés, votes, commentaires) ;</li>
              <li>
                des données techniques minimales (adresse IP le temps d&apos;une requête) pour limiter les abus
                (votes/commentaires en rafale) — jamais conservées au-delà de ce qui est nécessaire à cette
                protection.
              </li>
            </ul>
          </Section>

          <Section titre="Pourquoi">
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>faire fonctionner ton compte (connexion, préférences) ;</li>
              <li>afficher tes contributions à la communauté (pseudo et avatar sur tes deals et commentaires) ;</li>
              <li>protéger le site contre les abus (spam, votes truqués).</li>
            </ul>
          </Section>

          <Section titre="Ce qui n'est pas fait">
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>pas de revente de données à des tiers ;</li>
              <li>pas de publicité ciblée, pas de traceur publicitaire ;</li>
              <li>pas de collecte de données démographiques (âge, genre, origine, etc.).</li>
            </ul>
          </Section>

          <Section titre="Durée de conservation">
            <p>
              Tes données sont conservées tant que ton compte existe. Si tu supprimes ton compte, ton email et
              ton pseudo disparaissent définitivement ; tes commentaires restent visibles mais deviennent
              anonymes (&laquo;&nbsp;Membre supprimé&nbsp;&raquo;), et tes deals déjà publiés restent en ligne
              sans attribution — ils profitent toujours à la communauté qui les a votés.
            </p>
          </Section>

          <Section titre="Tes droits (loi 09-08)">
            <p>
              La loi marocaine 09-08 te donne le droit d&apos;accéder à tes données, de les rectifier, et de les
              faire effacer. Tu peux exercer ces trois droits directement, à tout moment, depuis{" "}
              <Link href="/compte" className="text-bleu font-bold hover:underline">
                ton compte
              </Link>{" "}
              : consulter ton profil et tes contributions (accès), modifier ton pseudo ou ta couleur d&apos;avatar
              (rectification), ou supprimer ton compte (effacement). Pour toute autre question, tu peux nous
              contacter directement.
            </p>
          </Section>

          <Section titre="Contact">
            <p>Une question sur tes données ? Écris-nous : contact@fidwastafid.com</p>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
