import { Seal } from "./Seal.js";

/** Chrome minimal — CONTRAT-V1 §8. Rien d'autre que le sceau et la phrase : pas de liens, pas de nouvelle page. */
export function SiteFooter() {
  return (
    <footer className="bg-sombre py-8 px-4 flex flex-col items-center gap-2">
      <Seal className="w-8 h-8" />
      {/* Pas de dir="rtl" : phrase mixte ar/fr, même convention que v1 (titleFr
          de la section "Nos valeurs") — l'algorithme bidi Unicode gère le
          segment arabe correctement dans un paragraphe de base LTR. */}
      <p className="font-arabic text-or text-lg text-center">فيد و ستافيد — partage et fais profiter</p>
    </footer>
  );
}
