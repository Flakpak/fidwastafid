/**
 * Sceau calligraphique فيد و ستافيد — CONTRAT-V1 §8 (design tokens, non
 * négociables). Médaillon SVG autonome — jamais un asset externe. Attributs
 * de présentation SVG uniquement (fill/stroke/…), jamais de prop `style` : le
 * CSP (middleware.ts) n'autorise `style-src` que par nonce, qui ne s'applique
 * pas à l'attribut HTML `style`.
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : le médaillon passe en ENCRE sur clair —
 * teintes seulement, la forme et la calligraphie sont non négociables et
 * restent intactes (arbitrage lot 2b). Plus de dégradé doré ni de fond foncé :
 * disque plâtre discret, gravure à l'encre.
 */
export function Seal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#faf8f4" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="#1a1815" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#1a1815" strokeWidth="0.5" strokeDasharray="2.5,4" opacity="0.3" />
      <polygon points="50,3 52,7 50,11 48,7" fill="#1a1815" opacity="0.85" />
      <polygon points="50,89 52,93 50,97 48,93" fill="#1a1815" opacity="0.85" />
      <polygon points="3,50 7,48 11,50 7,52" fill="#1a1815" opacity="0.85" />
      <polygon points="89,50 93,48 97,50 93,52" fill="#1a1815" opacity="0.85" />
      <text x="50" y="38" fontFamily="'Scheherazade New', serif" fontSize="22" fontWeight="700" fill="#1a1815" textAnchor="middle">
        فيد
      </text>
      <line x1="22" y1="48" x2="36" y2="48" stroke="#1a1815" strokeWidth="0.7" opacity="0.5" />
      <circle cx="22" cy="48" r="1.5" fill="#1a1815" opacity="0.5" />
      <text x="50" y="53" fontFamily="'Scheherazade New', serif" fontSize="11" fontWeight="400" fill="#1a1815" textAnchor="middle" opacity="0.85">
        و
      </text>
      <line x1="64" y1="48" x2="78" y2="48" stroke="#1a1815" strokeWidth="0.7" opacity="0.5" />
      <circle cx="78" cy="48" r="1.5" fill="#1a1815" opacity="0.5" />
      <text x="50" y="70" fontFamily="'Scheherazade New', serif" fontSize="20" fontWeight="700" fill="#1a1815" textAnchor="middle">
        ستافيد
      </text>
    </svg>
  );
}
