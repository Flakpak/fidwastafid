"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { cibleNavigationFiltre, type EtatFiltres } from "../lib/filtresFeed.js";

/**
 * Navigation effective — isolée dans un objet pour que le test client
 * (tests/navigationClic.tsx, jsdom) puisse observer l'URL d'arrivée sans
 * dépendre de `window.location.assign`, que jsdom n'implémente pas.
 */
export const navigationFiltre = {
  vers(url: string): void {
    window.location.assign(url);
  },
};

/**
 * Lien du filtre (lot SEO-3b, correctif) : `href` toujours PROPRE, sans
 * paramètre — c'est ce que voient Google et un navigateur sans JavaScript.
 * Au clic, si l'utilisateur a des choix actifs (tri, ville, où acheter,
 * recherche), on navigue vers le même chemin en les ajoutant. Sans choix
 * actif, le lien suit son cours normal (navigation Next).
 *
 * Un clic modifié (nouvel onglet, etc.) n'est jamais intercepté : il ouvre
 * la page propre, comme sans JavaScript.
 */
export function LienFiltre({
  href,
  filtres,
  className,
  actif = false,
  children,
}: {
  href: string;
  filtres: EtatFiltres;
  className: string;
  actif?: boolean;
  children: ReactNode;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const cible = cibleNavigationFiltre(href, filtres);
    if (cible === href) return;
    e.preventDefault();
    navigationFiltre.vers(cible);
  };

  return (
    <Link href={href} onClick={onClick} aria-current={actif ? "page" : undefined} className={className}>
      {children}
    </Link>
  );
}
