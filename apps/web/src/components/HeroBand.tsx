import { HeroArabicTypewriter } from "./HeroArabicTypewriter.js";

const STEPS = [
  {
    num: 1,
    titreFr: "Tu déniche une لهميزة",
    titreAr: "لقيتي لهميزة ديالك؟",
    desc: "En faisant tes courses en magasin ou en ligne — si ça t'a fait économiser, ça peut faire économiser tout le monde.",
  },
  {
    num: 2,
    titreFr: "Tu la partages en 30 sec",
    titreAr: "شاركها مع الجماعة",
    desc: "Prix, magasin, ville — c'est tout ce qu'il faut. Notre équipe vérifie et publie. Ton deal aide des centaines de personnes à faire les mêmes économies.",
  },
  {
    num: 3,
    titreFr: "La communauté vote",
    titreAr: "الجماعة تقيّم",
    desc: "ربح = deal intéressant, fonce. خسارة = à éviter. Les meilleures لهميزات remontent en tête — plus tu partages, plus tu construis ta réputation.",
  },
];

/**
 * Bandeau hero — porté depuis HeroBand (index.html racine, v1). Composant
 * serveur : seule la tagline arabe (typewriter) hydrate, cf.
 * HeroArabicTypewriter. Le popup mobile "bottom sheet" de v1 n'est pas
 * repris — ce bandeau reste inline à toutes les tailles, restylé en
 * responsive (v1 ne le masque pas non plus en mobile, seule la sidebar
 * disparaît).
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : panneaux clairs, encre, emphase de marque
 * en `accent` ; emojis retirés.
 */
export function HeroBand() {
  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-2xl p-6 md:p-8 mb-4">
      <div className="mb-5">
        <h1 className="text-xl md:text-[22px] font-black leading-tight mb-1.5 hero-fr-anim text-ink">
          Les meilleurs bons plans du Maroc,
          <br />
          <span className="text-accent">partagés par la communauté</span>
        </h1>
        <HeroArabicTypewriter />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 hero-steps-anim">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="flex md:block gap-3 items-start bg-surface-subtle border border-border rounded-2xl p-3.5 md:p-4"
          >
            <div className="flex items-center gap-2 mb-0 md:mb-2.5">
              <span className="bg-ink text-surface-base w-[26px] h-[26px] rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                {step.num}
              </span>
            </div>
            <div>
              <p className="text-[13px] font-black text-ink">{step.titreFr}</p>
              <p dir="rtl" className="font-arabic text-ink text-base font-bold leading-tight">
                {step.titreAr}
              </p>
              <p className="text-xs text-ink-muted font-semibold leading-relaxed mt-1">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
