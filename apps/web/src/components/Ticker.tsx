const ITEMS = [
  { num: "1", fr: "Tu trouves une bonne affaire en faisant tes courses", ar: "لقيتي لهميزة ديالك؟" },
  { num: "2", fr: "Tu la partages en 30 secondes chrono", ar: "شاركها مع الجماعة" },
  { num: "3", fr: "La communauté vote — les meilleures لهميزات remontent", ar: "الجماعة تقيّم" },
  { num: "🔥", fr: "fidwastafid.com — partage et fais profiter", ar: "فيد و ستافيد" },
];

/**
 * Bandeau défilant sous le header — porté depuis index.html (racine, v1,
 * .ticker-bar/.ticker-track). Animation CSS pure (translateX en boucle,
 * cf. globals.css) : contenu dupliqué une fois pour boucler sans à-coup
 * (translateX(-50%) ramène exactement au double du premier passage).
 * Composant serveur — rien à hydrater, la pause au survol et l'arrêt sous
 * prefers-reduced-motion sont gérés en CSS pur (:hover / media query).
 */
export function Ticker() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="bg-sombre overflow-hidden h-[34px] flex items-center border-b border-white/5">
      <div className="ticker-track flex items-center whitespace-nowrap will-change-transform">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 px-8 text-xs font-bold text-white/65 border-r border-white/10"
          >
            <span className="bg-rouge text-white w-[18px] h-[18px] rounded-[5px] inline-flex items-center justify-center text-[10px] font-black shrink-0">
              {item.num}
            </span>
            {item.fr}
            <span dir="rtl" className="font-arabic text-orange font-bold text-[13px]">
              — {item.ar}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
