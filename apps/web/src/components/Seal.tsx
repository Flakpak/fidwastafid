/**
 * Sceau calligraphique فيد و ستافيد — CONTRAT-V1 §8 (design tokens, non
 * négociables). Porté depuis index.html (racine, v1), medaillon SVG
 * autonome — jamais un asset externe, rien à rapatrier. Attributs de
 * présentation SVG uniquement (fill/stroke/...), jamais de prop `style` :
 * le CSP (middleware.ts) n'autorise `style-src` que par nonce, qui ne
 * s'applique pas à l'attribut HTML `style`.
 */
export function Seal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="seal-bg" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#2a1a0e" />
          <stop offset="100%" stopColor="#1a0e06" />
        </radialGradient>
        <linearGradient id="seal-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd43b" />
          <stop offset="50%" stopColor="#ff922b" />
          <stop offset="100%" stopColor="#f03e3e" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#seal-bg)" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="url(#seal-gold)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#ff922b" strokeWidth="0.5" strokeDasharray="2.5,4" opacity="0.6" />
      <polygon points="50,3 52,7 50,11 48,7" fill="#ffd43b" opacity="0.9" />
      <polygon points="50,89 52,93 50,97 48,93" fill="#ffd43b" opacity="0.9" />
      <polygon points="3,50 7,48 11,50 7,52" fill="#ffd43b" opacity="0.9" />
      <polygon points="89,50 93,48 97,50 93,52" fill="#ffd43b" opacity="0.9" />
      <text x="50" y="38" fontFamily="'Scheherazade New', serif" fontSize="22" fontWeight="700" fill="url(#seal-gold)" textAnchor="middle">
        فيد
      </text>
      <line x1="22" y1="48" x2="36" y2="48" stroke="#ff922b" strokeWidth="0.7" opacity="0.7" />
      <circle cx="22" cy="48" r="1.5" fill="#ff922b" opacity="0.7" />
      <text x="50" y="53" fontFamily="'Scheherazade New', serif" fontSize="11" fontWeight="400" fill="#ff922b" textAnchor="middle" opacity="0.85">
        و
      </text>
      <line x1="64" y1="48" x2="78" y2="48" stroke="#ff922b" strokeWidth="0.7" opacity="0.7" />
      <circle cx="78" cy="48" r="1.5" fill="#ff922b" opacity="0.7" />
      <text x="50" y="70" fontFamily="'Scheherazade New', serif" fontSize="20" fontWeight="700" fill="#f03e3e" textAnchor="middle">
        ستافيد
      </text>
    </svg>
  );
}
