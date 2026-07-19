import Link from "next/link";
import { Seal } from "./Seal.js";

/** Chrome minimal — CONTRAT-V1 §8. Exception consciente (espace membre,
 *  amendement 16/07/2026) : les liens vers /confidentialite et /contact sont
 *  ajoutés ici, seuls liens du footer — nécessaires pour rendre la politique
 *  de confidentialité (loi 09-08) et le canal de contact découvrables, pas
 *  une dérive vers un footer de liens classique. */
export function SiteFooter() {
  return (
    <footer className="bg-sombre py-8 px-4 flex flex-col items-center gap-2">
      <Seal className="w-8 h-8" />
      {/* Pas de dir="rtl" : phrase mixte ar/fr, même convention que v1 (titleFr
          de la section "Nos valeurs") — l'algorithme bidi Unicode gère le
          segment arabe correctement dans un paragraphe de base LTR. */}
      <p className="font-arabic text-or text-lg text-center">فيد و ستافيد — partage et fais profiter</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
        <Link href="/confidentialite" className="hover:text-white/80">
          Confidentialité
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact" className="hover:text-white/80">
          Contact
        </Link>
      </div>
    </footer>
  );
}
