import Link from "next/link";

/** Chrome minimal — CONTRAT-V1 §8. Exception consciente (espace membre,
 *  amendement 16/07/2026) : les liens vers /confidentialite et /contact sont
 *  ajoutés ici, seuls liens du footer — nécessaires pour rendre la politique
 *  de confidentialité (loi 09-08) et le canal de contact découvrables, pas
 *  une dérive vers un footer de liens classique.
 *
 *  Charte Tadelakt (CONTRAT-V1 §8) : footer clair (`surface` + filet haut
 *  `border`), sceau en encre (wordmark, à la place du médaillon coloré de la
 *  v1). Les quatre colonnes de la maquette ne sont PAS reprises : elles pointeraient
 *  vers des routes inexistantes (villes/catégories/cookies…) — c'est une
 *  décision d'architecture d'information, pas un swap de tokens. Le footer
 *  reste volontairement minimal. */
export function SiteFooter() {
  return (
    <footer className="bg-surface border-t border-border py-8 px-4 flex flex-col items-center gap-2">
      {/* Pas de dir="rtl" : phrase mixte ar/fr, même convention que v1 (titleFr
          de la section "Nos valeurs") — l'algorithme bidi Unicode gère le
          segment arabe correctement dans un paragraphe de base LTR. */}
      <p className="font-arabic text-ink text-lg text-center">فيد و ستافيد — partage et fais profiter</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-ink-muted">
        <Link href="/confidentialite" className="hover:text-ink">
          Confidentialité
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact" className="hover:text-ink">
          Contact
        </Link>
      </div>
    </footer>
  );
}
