/**
 * Sceau calligraphique فيد و ستافيد — CONTRAT-V1 §8 (design tokens, non
 * négociables). Médaillon SVG autonome — jamais un asset externe. Attributs
 * de présentation SVG uniquement (fill/stroke/…), jamais de prop `style` : le
 * CSP (middleware.ts) n'autorise `style-src` que par nonce, qui ne s'applique
 * pas à l'attribut HTML `style`.
 *
 * Lot 4 — RÉGRESSION CORRIGÉE : le lot 2b avait réduit le sceau à un simple
 * wordmark texte, ce qui violait le §8 (le médaillon y est déclaré non
 * négociable). Le médaillon est restauré, en encre et safran (maquette
 * `docs/maquettes/tadelakt-couleur-subtile.html`) : anneau extérieur `safran`,
 * anneau intérieur `safran-line`, disque `ink`, calligraphie en #F0D9A8
 * (12,8:1 sur l'encre).
 *
 * Le safran vit ICI et dans le motif du hero, nulle part ailleurs (§8, règle
 * 4) : c'est un ornement de marque, jamais un composant d'interface.
 *
 * Le nom latin « Fidwastafid » sous la calligraphie rend la marque
 * identifiable par qui ne lit pas l'arabe — il ne se supprime pas.
 *
 * `variant="clair"` : déclinaison pour fond coloré/sombre (anneaux clairs,
 * disque blanc, calligraphie `accent`).
 */
export function Seal({
  className,
  variant = "defaut",
  withWordmark = false,
}: {
  className?: string;
  variant?: "defaut" | "clair";
  /** Ajoute le bloc texte à droite du médaillon (en-tête, pied de page). */
  withWordmark?: boolean;
}) {
  const clair = variant === "clair";
  const anneau = clair ? "#F0D9A8" : "#b07c2a"; // safran
  const anneauInterne = clair ? "#FFFFFF" : "#e0c793"; // safran-line
  const disque = clair ? "#FFFFFF" : "#1a1815"; // ink
  const calligraphie = clair ? "#2f6b57" : "#F0D9A8"; // accent

  const medaillon = (
    <svg className={className} viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="19" cy="19" r="17.5" fill="none" stroke={anneau} strokeWidth="1.3" />
      <circle cx="19" cy="19" r="14.4" fill="none" stroke={anneauInterne} strokeWidth="1" />
      <circle cx="19" cy="19" r="12.6" fill={disque} />
      <text
        x="19"
        y="24.4"
        textAnchor="middle"
        fontFamily="'Scheherazade New', serif"
        fontSize="14.5"
        fill={calligraphie}
      >
        فيد
      </text>
    </svg>
  );

  if (!withWordmark) return medaillon;

  return (
    <span className="inline-flex items-center gap-2.5">
      {medaillon}
      <span className="flex flex-col leading-[1.05]">
        <span dir="rtl" className={`font-arabic text-[19px] pb-0.5 ${clair ? "text-surface-base" : "text-ink"}`}>
          فيد و ستافيد
        </span>
        <span
          className={`text-[9.5px] tracking-[0.19em] uppercase ${clair ? "text-surface-base/70" : "text-ink-subtle"}`}
        >
          Fidwastafid
        </span>
      </span>
    </span>
  );
}
