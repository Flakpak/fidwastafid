import Link from "next/link";
import { HeroArabicTypewriter } from "./HeroArabicTypewriter.js";
import { buttonClasses } from "./Button.js";

/**
 * Contenu RESTAURÉ à l'identique depuis main (correction de périmètre du
 * 26/07/2026) : le lot 4 avait remplacé ces trois étapes par une baseline, deux
 * boutons et des chiffres d'audience — tout cela venait du remplissage de la
 * maquette, pas du produit. Voir CONTRAT-V1 §8, règle 5 : une maquette est une
 * référence VISUELLE, jamais une source de contenu.
 */
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
 * Motif zellige — ornement de marque (CONTRAT-V1 §8, règle 4 : c'est l'un des
 * deux seuls emplacements où le `safran` est autorisé, avec le logotype).
 * Purement décoratif, donc `aria-hidden` ; masqué en mobile, où il n'y a pas
 * la place et où il concurrencerait le texte.
 *
 * Attributs de présentation SVG uniquement, jamais de prop `style` : le CSP
 * (middleware.ts) n'autorise `style-src` que par nonce, qui ne s'applique pas
 * à l'attribut HTML `style`.
 */
function MotifZellige() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -top-8 -right-12 hidden h-[330px] w-[330px] opacity-55 md:block"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="zellige" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M22 3 41 22 22 41 3 22Z" fill="none" stroke="#b07c2a" strokeWidth="1.1" opacity="0.45" />
          <circle cx="22" cy="22" r="5" fill="none" stroke="#2f6b57" strokeWidth="0.9" opacity="0.38" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#zellige)" />
    </svg>
  );
}

/**
 * Bandeau hero — porté depuis HeroBand (index.html racine, v1). Composant
 * serveur : seule la tagline arabe (typewriter) hydrate, cf.
 * HeroArabicTypewriter. Le popup mobile "bottom sheet" de v1 n'est pas
 * repris — ce bandeau reste inline à toutes les tailles, restylé en
 * responsive (v1 ne le masque pas non plus en mobile, seule la sidebar
 * disparaît).
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : champ `accent-soft` — un plâtre très
 * légèrement teinté, pas un aplat vert — motif zellige en filigrane, segment
 * de titre en `accent`. Le CONTENU (titre, trois étapes, sous-titres arabes,
 * descriptions) est celui d'origine : seul le traitement visuel change.
 */
export function HeroBand() {
  return (
    <div className="relative overflow-hidden bg-accent-soft border border-border rounded-2xl p-6 md:p-8 mb-4">
      <MotifZellige />

      <div className="relative mb-5">
        <h1 className="text-xl md:text-[22px] font-black leading-tight mb-1.5 hero-fr-anim text-ink">
          Les meilleurs bons plans du Maroc,
          <br />
          <span className="text-accent">partagés par la communauté</span>
        </h1>
        <HeroArabicTypewriter />
      </div>

      <div className="relative mb-4 grid grid-cols-1 md:grid-cols-3 gap-2.5 hero-steps-anim">
        {STEPS.map((step) => (
          <div key={step.num} className="flex md:block gap-3 items-start bg-surface border border-border rounded-2xl p-3.5 md:p-4">
            <div className="flex items-center gap-2 mb-0 md:mb-2.5">
              <span className="bg-accent text-white w-[26px] h-[26px] rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                {step.num}
              </span>
            </div>
            <div>
              <p className="text-[13px] font-black text-ink">{step.titreFr}</p>
              <p dir="rtl" className="font-arabic text-accent text-base font-bold leading-tight">
                {step.titreAr}
              </p>
              <p className="text-xs text-ink-muted font-semibold leading-relaxed mt-1">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/*
       * Ligne de clôture du hero — RÉCUPÉRATION du lot 7 : ces deux entrées
       * vivaient dans le rail desktop supprimé par ce lot, et personne
       * n'avait décidé de les supprimer. Elles reviennent ici, qui est leur
       * place logique : le hero explique le concept en trois étapes, la
       * suite naturelle est d'en savoir plus ou de contribuer.
       *
       * Visibles en mobile ET en desktop, alors que le rail était
       * `hidden md:flex` — l'absence mobile était déjà un manque, pas une
       * décision.
       *
       * Libellé arabe repris VERBATIM du rail (git, Feed.tsx avant ce lot) :
       * `فيد و ستافيد`. Ce n'est pas « شارك دييل » — aucun libellé n'est
       * inventé ici.
       */}
      {/*
       * Variante `brand` et NON `primary` : §8 règle 1 — une seule action
       * pleine par écran, et c'est « Soumettre un deal » dans l'en-tête, qui
       * est persistant là où ce hero se traverse une fois. Le rail d'origine
       * n'était pas non plus un aplat. Le lien concept reste un lien texte,
       * pour qu'il ne se confonde pas avec le bouton juste à côté.
       */}
      <div className="relative flex flex-col items-center gap-3 border-t border-accent-line pt-5 sm:flex-row sm:justify-center sm:gap-5">
        <Link
          href="/soumettre"
          aria-label="Partage un bon plan — soumettre un deal"
          className={buttonClasses({ variant: "brand", arabic: true })}
        >
          فيد و ستافيد
        </Link>
        <Link
          href="/concept"
          className="min-h-11 inline-flex items-center text-sm font-bold text-accent underline underline-offset-4 hover:text-accent-hi focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Le concept Fidwastafid
        </Link>
      </div>
    </div>
  );
}
