"use client";

import { useEffect, useState } from "react";
import { buildShareText } from "./shareText.js";

interface ShareButtonProps {
  titre: string;
  prixPromo: number;
  prixNormal?: number;
  dealHref: string;
}

/**
 * Bouton partage — Web Share API avec repli copie du lien si l'API est
 * absente (toujours une action proposée, jamais masqué). Composant client
 * minimal et isolé, réutilisé sur la carte du feed ET la page deal.
 */
export function ShareButton({ titre, prixPromo, prixNormal, dealHref }: ShareButtonProps) {
  const [canShare, setCanShare] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- détection de feature volontairement post-montage, seule façon d'éviter un mismatch SSR/client sur `navigator`
    setCanShare(typeof navigator.share === "function");
  }, []);

  async function partager(e: React.MouseEvent) {
    e.preventDefault();
    const url = `${window.location.origin}${dealHref}`;
    const text = buildShareText(prixPromo, prixNormal, url);

    if (canShare) {
      // `text` inclut déjà l'URL (buildShareText) : pas de champ `url`
      // séparé, pour ne jamais risquer un doublon selon la façon dont
      // l'app receveuse recompose `text`+`url` (incident du 20/07/2026,
      // même logique que la suppression du titre/préfixe redondants).
      void navigator.share({ title: titre, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <button type="button" onClick={(e) => void partager(e)} className="text-muted hover:text-rouge">
      {copie ? "✅ Copié" : "🔗 Partager"}
    </button>
  );
}
