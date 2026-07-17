import { HeroArabicTypewriter } from "./HeroArabicTypewriter.js";

const STEPS = [
  {
    num: 1,
    emoji: "🔍",
    titreFr: "Tu déniche une لهميزة",
    titreAr: "لقيتي لهميزة ديالك؟",
    desc: "En faisant tes courses en magasin ou en ligne — si ça t'a fait économiser, ça peut faire économiser tout le monde.",
  },
  {
    num: 2,
    emoji: "📤",
    titreFr: "Tu la partages en 30 sec",
    titreAr: "شاركها مع الجماعة",
    desc: "Prix, magasin, ville — c'est tout ce qu'il faut. Notre équipe vérifie et publie. Ton deal aide des centaines de personnes à faire les mêmes économies.",
  },
  {
    num: 3,
    emoji: "🔥",
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
 */
export function HeroBand() {
  return (
    <div className="relative overflow-hidden bg-white border border-bordure rounded-2xl p-6 md:p-8 mb-4">
      <div className="mb-5">
        <h1 className="text-xl md:text-[22px] font-black leading-tight mb-1.5 hero-fr-anim">
          Les meilleurs bons plans du Maroc,
          <br />
          <span className="text-rouge">partagés par la communauté</span>
        </h1>
        <HeroArabicTypewriter />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 hero-steps-anim">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className="flex md:block gap-3 items-start bg-creme border border-bordure rounded-2xl p-3.5 md:p-4"
          >
            <div className="flex items-center gap-2 mb-0 md:mb-2.5">
              <span className="bg-rouge text-white w-[26px] h-[26px] rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                {step.num}
              </span>
              <span className="text-lg w-[26px] h-[26px] flex items-center justify-center shrink-0">{step.emoji}</span>
            </div>
            <div>
              <p className="text-[13px] font-black">{step.titreFr}</p>
              <p dir="rtl" className="font-arabic text-rouge text-base font-bold leading-tight">
                {step.titreAr}
              </p>
              <p className="text-xs text-muted font-semibold leading-relaxed mt-1">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
