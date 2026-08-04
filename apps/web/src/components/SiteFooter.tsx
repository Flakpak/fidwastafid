import Link from "next/link";
import { Brand } from "./Brand.js";
import { GererConsentement } from "./GererConsentement.js";

/** Chrome minimal — CONTRAT-V1 §8. Exception consciente (espace membre,
 *  amendement 16/07/2026) : les liens vers /confidentialite et /contact sont
 *  ajoutés ici, seuls liens du footer — nécessaires pour rendre la politique
 *  de confidentialité (loi 09-08) et le canal de contact découvrables, pas
 *  une dérive vers un footer de liens classique.
 *
 *  Charte Tadelakt (CONTRAT-V1 §8) : footer clair (`surface` + filet haut
 *  `border`), marque = logotype complet AVEC baseline (lot 5) — c'est le seul
 *  emplacement du chrome qui a la place de la porter. La calligraphie arabe
 *  vit ici en SIGNATURE SECONDAIRE, et nulle part ailleurs dans le chrome
 *  (§8 : elle reste non négociable à ce titre).
 *  Les quatre colonnes de la maquette ne sont PAS reprises : elles pointeraient
 *  vers des routes inexistantes (villes/catégories…) — c'est une décision
 *  d'architecture d'information, pas un swap de tokens. Le footer reste
 *  volontairement minimal.
 *
 *  « Cookies » (lot consentement) fait exception à dessein : ce n'est pas une
 *  route, c'est l'unique accès permanent pour revenir sur son choix de
 *  mesure d'audience — sans lui, un refus initial serait définitif. */
export function SiteFooter() {
  return (
    <footer className="bg-surface border-t border-border py-8 px-4 flex flex-col items-center gap-2">
      {/* Zone de protection : le `gap-2` du conteneur et le `py-8` laissent
          au moins une hauteur de capitale libre autour du logotype (§8). */}
      <Brand forme="full" hauteur={44} className="max-w-full h-auto" />
      {/* Signature secondaire. Pas de dir="rtl" : phrase mixte ar/fr, même
          convention que v1 (titleFr de la section "Nos valeurs") — l'algorithme
          bidi Unicode gère le segment arabe correctement dans un paragraphe de
          base LTR. Texte restauré à l'identique depuis main (correction de
          périmètre du 26/07/2026) : seule la couleur change. */}
      <p className="font-arabic text-ink text-lg text-center">فيد و ستافيد — partage et fais profiter</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
        {/* « Le concept » descend ici avec le lot 7 : il vivait dans le rail
            desktop de l'accueil, retiré par ce lot. Au pied de page, il est
            atteignable depuis TOUT le site — et depuis mobile, où le rail
            n'a jamais existé. */}
        <Link href="/concept" className="hover:text-ink">
          Le concept
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/confidentialite" className="hover:text-ink">
          Confidentialité
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact" className="hover:text-ink">
          Contact
        </Link>
        <span aria-hidden="true">·</span>
        <GererConsentement />
      </div>
    </footer>
  );
}
