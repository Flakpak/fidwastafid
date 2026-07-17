"use client";

import { useEffect, useState } from "react";

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
    const pct = prixNormal && prixNormal > prixPromo ? Math.round((1 - prixPromo / prixNormal) * 100) : null;
    const url = `${window.location.origin}${dealHref}`;
    const text = `Fidwastafid : ${titre} à ${prixPromo} DH${pct !== null ? ` (-${pct}%)` : ""}`;

    if (canShare) {
      void navigator.share({ title: titre, text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <button type="button" onClick={(e) => void partager(e)} className="text-muted hover:text-rouge">
      {copie ? "✅ Copié" : "🔗 Partager"}
    </button>
  );
}
