"use client";

import { useEffect, useRef, useState } from "react";
import { construireParamsCompte } from "../lib/feedPagination.js";
import type { EtatFiltres } from "../lib/filtresFeed.js";

/**
 * Nombre de résultats — `GET /api/v1/deals/compte` pour un jeu de filtres
 * donné. Deux appelants, deux jeux différents : le bloc collant suit les
 * filtres APPLIQUÉS, la feuille suit son BROUILLON (pour annoncer ce que
 * l'application produira, avant de l'appliquer).
 *
 * `initial` vient du SSR pour l'état d'ouverture de la page : sans lui, le
 * compteur afficherait un blanc au premier rendu, juste au-dessus d'une liste
 * déjà remplie.
 *
 * Un total périmé n'est jamais laissé à l'écran comme s'il était à jour : un
 * échec l'efface (`null`) plutôt que de figer le précédent sous de nouveaux
 * filtres.
 */
export function useTotalResultats(filtres: EtatFiltres, initial: number | null = null): number | null {
  const params = construireParamsCompte(filtres).toString();
  const [total, setTotal] = useState<number | null>(initial);
  /** Jeu de paramètres déjà couvert par `total` — évite de rejouer côté
   *  client la requête que le serveur vient de faire au rendu initial. */
  const servi = useRef<string | null>(initial === null ? null : params);

  useEffect(() => {
    if (servi.current === params) return;

    let annule = false;

    void (async () => {
      try {
        const res = await fetch(`/api/v1/deals/compte?${params}`);
        if (!res.ok) {
          console.error(`[compte] HTTP ${res.status} sur ${params}`);
          if (!annule) setTotal(null);
          return;
        }
        const body = (await res.json()) as { total: number };
        if (annule) return;
        servi.current = params;
        setTotal(body.total);
      } catch (err) {
        console.error("[compte] erreur réseau", err);
        if (!annule) setTotal(null);
      }
    })();

    return () => {
      annule = true;
    };
  }, [params]);

  return total;
}
