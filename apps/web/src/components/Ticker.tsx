const ITEMS: { num: string | null; fr: string; ar: string }[] = [
  { num: "1", fr: "Tu trouves une bonne affaire en faisant tes courses", ar: "لقيتي لهميزة ديالك؟" },
  { num: "2", fr: "Tu la partages en 30 secondes chrono", ar: "شاركها مع الجماعة" },
  { num: "3", fr: "La communauté vote — les meilleures لهميزات remontent", ar: "الجماعة تقيّم" },
  { num: null, fr: "fidwastafid.com — partage et fais profiter", ar: "فيد و ستافيد" },
];

/**
 * Bandeau défilant sous le header — porté depuis index.html (racine, v1,
 * .ticker-bar/.ticker-track). Animation CSS pure (translateX en boucle,
 * cf. globals.css) : contenu dupliqué une fois pour boucler sans à-coup
 * (translateX(-50%) ramène exactement au double du premier passage).
 * Composant serveur — rien à hydrater, la pause au survol et l'arrêt sous
 * prefers-reduced-motion sont gérés en CSS pur (:hover / media query).
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : bandeau clair (`surface` + filet `border`),
 * cohérent avec l'en-tête, plus le fond foncé v1. Emojis retirés.
 */
export function Ticker() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="bg-surface overflow-hidden h-[34px] flex items-center border-b border-border">
      <div className="ticker-track flex items-center whitespace-nowrap will-change-transform">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 px-8 text-xs font-bold text-ink-muted border-r border-border"
          >
            {item.num && (
              <span className="bg-ink text-surface-base w-[18px] h-[18px] rounded-[5px] inline-flex items-center justify-center text-[10px] font-black shrink-0">
                {item.num}
              </span>
            )}
            {item.fr}
            <span dir="rtl" className="font-arabic text-accent font-bold text-[13px]">
              — {item.ar}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
