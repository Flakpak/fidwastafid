import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";

const DESCRIPTION =
  "Un problème sur un deal, une question, une donnée à faire retirer, une idée de partenariat — écris-nous à contact@fidwastafid.com.";

export const metadata: Metadata = {
  title: "Contact",
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact — Fidwastafid", description: DESCRIPTION, url: "/contact" },
};

/**
 * Sujet pré-rempli du mailto — encodé une seule fois ici, jamais dupliqué
 * dans le texte du bouton (qui reste libre de changer sans casser le lien).
 */
const MAILTO_HREF = `mailto:contact@fidwastafid.com?subject=${encodeURIComponent("Contact fidwastafid")}`;

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black mb-1">Contact</h1>
            <p className="text-sm text-muted leading-relaxed">
              Un problème sur un deal, une question sur le site, une donnée à faire retirer, une idée de
              partenariat — écris-nous, on te répond.
            </p>
            {/* Touche darija, même esprit que le footer (فيد و ستافيد) — pas
                de traduction juxtaposée ici, juste un signe de proximité,
                cohérent avec le ton court et chaleureux voulu pour cette page. */}
            <p dir="rtl" className="font-arabic text-rouge text-lg mt-2">
              على راحتك، حنا هنا
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={MAILTO_HREF}
              className="self-start bg-rouge text-white rounded-xl px-6 py-3 text-sm font-black"
            >
              ✉️ Écris-nous : contact@fidwastafid.com
            </a>
            <p className="text-xs text-muted">
              On répond dans un délai raisonnable, généralement quelques jours ouvrés — pas d&apos;équipe support
              24/7, on est une petite communauté.
            </p>
          </div>

          <div className="text-sm text-muted leading-relaxed flex flex-col gap-2">
            <p>Quelques exemples de bonnes raisons de nous écrire :</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>signaler un problème sur un deal (prix faux, offre expirée, lien mort...) ;</li>
              <li>poser une question sur le fonctionnement du site ;</li>
              <li>demander l&apos;accès, la rectification ou le retrait d&apos;une donnée te concernant (loi 09-08) ;</li>
              <li>proposer un partenariat.</li>
            </ul>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
