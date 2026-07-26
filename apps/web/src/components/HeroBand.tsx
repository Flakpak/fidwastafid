import { HeroArabicTypewriter } from "./HeroArabicTypewriter.js";

const STATS = [
  { valeur: "184", label: "Deals actifs" },
  { valeur: "27", label: "Enseignes" },
  { valeur: "4 210", label: "Membres" },
];

/**
 * Motif zellige — ornement de marque (CONTRAT-V1 §8, règle 4 : c'est l'un des
 * deux seuls emplacements où le `safran` est autorisé, avec le sceau).
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
 * HeroArabicTypewriter.
 *
 * Lot 4 (maquette `docs/maquettes/tadelakt-couleur-subtile.html`) : le hero
 * devient un CHAMP `accent-soft` — un plâtre très légèrement teinté, pas un
 * aplat vert. C'est ce qui lui donne de la chaleur sans écraser le feed juste
 * en dessous : si le hero criait, tout ce qui suit paraîtrait fade par
 * contraste. Les trois étapes explicatives de la v1 laissent la place à une
 * baseline + deux actions + les chiffres clés, comme la maquette.
 */
export function HeroBand() {
  return (
    <div className="relative overflow-hidden bg-accent-soft border border-border rounded-2xl px-6 py-8 md:px-8 mb-4">
      <MotifZellige />

      <div className="relative max-w-[620px]">
        {/* Baseline arabe en safran — ornement de marque (§8, règle 4). */}
        <span dir="rtl" className="font-arabic text-safran text-[22px] leading-snug block mb-1 hero-fr-anim">
          فيد و ستافيد
        </span>

        <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-tight text-ink mb-2 hero-fr-anim">
          Les bons plans du Maroc, trouvés par <span className="text-accent">ceux qui les vivent</span>.
        </h1>

        <div className="mb-4">
          <HeroArabicTypewriter />
        </div>

        <div className="flex flex-wrap gap-2.5 hero-steps-anim">
          <a
            href="#deals"
            className="inline-flex items-center justify-center h-10 rounded-[9px] border border-transparent bg-accent px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-hi transition-colors duration-[130ms] active:translate-y-px motion-reduce:transition-none"
          >
            Voir les deals du jour
          </a>
          <a
            href="/concept"
            className="inline-flex items-center justify-center h-10 rounded-[9px] border border-accent-line bg-surface px-4 text-sm font-medium text-accent hover:bg-accent-soft hover:border-accent transition-colors duration-[130ms] active:translate-y-px motion-reduce:transition-none"
          >
            Le concept Fidwastafid
          </a>
        </div>

        <div className="mt-5 flex gap-7 border-t border-accent-line pt-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <b className="block text-[19px] font-semibold tracking-tight tabular-nums text-accent">{s.valeur}</b>
              <span className="text-[10.5px] uppercase tracking-[0.09em] text-ink-subtle">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
