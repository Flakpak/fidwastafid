import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";

const DESCRIPTION =
  "Quelles données Fidwastafid conserve, ce que ton navigateur reçoit, où elles sont hébergées, et comment exercer tes droits (loi 09-08 et RGPD).";

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
      <div className="text-sm text-ink-muted leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      <main className="max-w-3xl mx-auto p-4">
        <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(26,24,21,0.05)] p-6 md:p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Confidentialité</h1>
            <p className="text-sm text-ink-muted">
              Cette page explique simplement quelles données Fidwastafid conserve à ton sujet, ce que ton
              navigateur reçoit techniquement, où tout ça est hébergé, et comment garder la main dessus.
            </p>
          </div>

          <Section titre="Ce que tu nous confies">
            <p>Uniquement ce qui est nécessaire au fonctionnement du compte et de la communauté :</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>ton email, utilisé pour te connecter — jamais affiché publiquement ;</li>
              <li>ton pseudo et la couleur de ton avatar, affichés à côté de tes contributions ;</li>
              <li>l&apos;historique de tes contributions (deals partagés, votes, commentaires) ;</li>
              <li>
                le numéro WhatsApp d&apos;un vendeur, quand tu le renseignes en soumettant un bon plan — il
                n&apos;est publié sur la page du deal que si tu as explicitement coché l&apos;autorisation
                d&apos;affichage public au moment de la soumission ; sans cette case cochée, il reste visible
                uniquement par la modération. Tu peux demander son retrait à tout moment en{" "}
                <Link href="/contact" className="text-accent font-bold hover:underline">
                  contactant la modération
                </Link>{" "}
                ;
              </li>
              <li>
                des données techniques minimales (adresse IP le temps d&apos;une requête) pour limiter les abus
                (votes/commentaires en rafale) — jamais conservées au-delà de ce qui est nécessaire à cette
                protection.
              </li>
            </ul>
          </Section>

          <Section titre="Ce que ton navigateur reçoit">
            <p>Deux choses seulement, toutes deux strictement nécessaires au fonctionnement du site :</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>
                <strong className="text-ink">un cookie de session</strong> (<code>fid_session</code>) une fois
                connecté — il porte ta connexion, rien d&apos;autre. Illisible en JavaScript, transmis
                uniquement en HTTPS, et supprimé quand ta session expire ;
              </li>
              <li>
                <strong className="text-ink">un brouillon de soumission</strong>, uniquement sur la page{" "}
                <Link href="/soumettre" className="text-accent font-bold hover:underline">
                  Soumettre un deal
                </Link>{" "}
                — gardé le temps de l&apos;onglet ouvert (stockage local du navigateur, jamais transmis à nos
                serveurs), effacé à la fermeture de l&apos;onglet ou une fois la soumission envoyée.
              </li>
            </ul>
          </Section>

          <Section titre="Mesure d'audience">
            <p>
              Le site propose de mesurer son audience avec Vercel Web Analytics, pour savoir combien de pages
              sont vues sans savoir par qui — ce script ne se charge que si tu l&apos;acceptes, jamais avant.
              D&apos;après la documentation publique de Vercel : aucun cookie tiers, les visiteurs sont
              identifiés par un hachage recalculé à chaque visite et jamais conservé plus de 24 h, et les
              données enregistrées sont agrégées — horodatage, page vue, provenance, localisation approximative
              (pays/région/ville) et type d&apos;appareil, jamais un nom, un email ou une adresse IP en clair.
            </p>
            <p>
              Ton choix (accepter ou refuser) est mémorisé sur cet appareil, jamais transmis à nos serveurs, et
              révocable à tout moment depuis le lien <strong className="text-ink">« Cookies »</strong> en pied
              de page.
            </p>
          </Section>

          <Section titre="Vérification anti-robot">
            <p>
              Sur la page{" "}
              <Link href="/soumettre" className="text-accent font-bold hover:underline">
                Soumettre un deal
              </Link>{" "}
              uniquement, un widget Cloudflare Turnstile vérifie que ta soumission vient bien d&apos;une
              personne avant de l&apos;accepter. Cloudflare qualifie les signaux qu&apos;il recueille à cette
              fin (adresse IP, empreinte technique du navigateur) de « strictement nécessaires » à la détection
              de robots, et affirme ne pas pouvoir identifier directement une personne à partir d&apos;eux. Ce
              widget est un service tiers : ce qu&apos;il dépose exactement dans ton navigateur (cookie ou
              état technique) est régi par la politique de Cloudflare, pas par nous.
            </p>
          </Section>

          <Section titre="Où sont hébergées tes données">
            <p>
              La base de données (Supabase) et les serveurs qui font tourner le site (Vercel) sont configurés
              dans la même région, en Irlande — Union européenne. Pour un visiteur au Maroc, cela veut dire que
              tes données quittent le territoire marocain pour être traitées dans l&apos;UE ; pour un visiteur
              résidant dans l&apos;UE, cela veut dire qu&apos;elles n&apos;en sortent pas.
            </p>
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

          <Section titre="Tes droits">
            <p>
              La loi marocaine 09-08 te donne le droit d&apos;accéder à tes données, de les rectifier, et de
              les faire effacer. Si tu résides dans l&apos;Union européenne, le RGPD s&apos;applique en plus et
              ajoute un droit d&apos;opposition, ainsi que le droit d&apos;introduire une réclamation auprès de
              l&apos;autorité de protection des données de ton pays de résidence.
            </p>
            <p>
              Tu peux exercer l&apos;accès, la rectification et l&apos;effacement directement, à tout moment,
              depuis{" "}
              <Link href="/compte" className="text-accent font-bold hover:underline">
                ton compte
              </Link>{" "}
              : consulter ton profil et tes contributions (accès), modifier ton pseudo ou ta couleur
              d&apos;avatar (rectification), ou supprimer ton compte (effacement). Pour l&apos;opposition ou
              toute autre question, tu peux{" "}
              <Link href="/contact" className="text-accent font-bold hover:underline">
                nous contacter directement
              </Link>
              .
            </p>
          </Section>

          <Section titre="Contact">
            {/*
             * REPÈRE — identité juridique du responsable de traitement.
             * Obligatoire tant au Maroc (loi 09-08) que dans l'UE (RGPD,
             * art. 13) : raison sociale, forme juridique, adresse du siège.
             * À fournir par Kamel — volontairement NON inventée ici (aucune
             * forme sociale, aucune adresse plausible écrite à sa place).
             * Une fois fournie, l'ajouter en premier paragraphe de cette
             * section, avant la phrase de contact ci-dessous.
             */}
            <p>
              Une question sur tes données ? Le responsable du traitement est Fidwastafid, joignable à{" "}
              <Link href="/contact" className="text-accent font-bold hover:underline">
                contact@fidwastafid.com
              </Link>
              .
            </p>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
