"use client";

import { useEffect, useRef, useState } from "react";
import { construireParamsFacettes } from "../lib/feedPagination.js";
import type { EtatFiltres } from "../lib/filtresFeed.js";
import type { Facettes } from "./api/v1/_lib/dealsFacettes.js";

/**
 * Compteurs contextuels — `GET /api/v1/deals/facettes` pour un jeu de filtres
 * donné. Deux appelants, deux jeux différents : la barre suit les filtres
 * APPLIQUÉS (pour le compteur de résultats sous la barre), la feuille suit
 * son BROUILLON (pour annoncer ce que l'application produira, avant de
 * l'appliquer).
 *
 * `initiales` vient du SSR pour l'état d'ouverture de la page : sans elles,
 * le compteur de résultats afficherait un blanc au premier rendu, juste sous
 * une liste déjà remplie.
 *
 * Les compteurs périmés ne sont jamais laissés à l'écran comme s'ils étaient
 * à jour : pendant un rechargement, `chargement` permet à l'appelant de les
 * estomper, et un échec les efface (`null`) plutôt que de figer les
 * précédents sous les nouveaux filtres — ce serait précisément le « total
 * figé présenté comme contextuel » que ce lot interdit.
 */
export function useFacettes(
  filtres: EtatFiltres,
  initiales: Facettes | null = null
): { facettes: Facettes | null; chargement: boolean } {
  const params = construireParamsFacettes(filtres).toString();
  const [facettes, setFacettes] = useState<Facettes | null>(initiales);
  const [chargement, setChargement] = useState(false);
  /** Jeu de paramètres déjà couvert par `facettes` — évite de rejouer côté
   *  client la requête que le serveur vient de faire au rendu initial. */
  const servi = useRef<string | null>(initiales ? params : null);

  useEffect(() => {
    if (servi.current === params) return;

    let annule = false;
    setChargement(true);

    void (async () => {
      try {
        const res = await fetch(`/api/v1/deals/facettes?${params}`);
        if (!res.ok) {
          console.error(`[facettes] HTTP ${res.status} sur ${params}`);
          if (!annule) setFacettes(null);
          return;
        }
        const body = (await res.json()) as Facettes;
        if (annule) return;
        servi.current = params;
        setFacettes(body);
      } catch (err) {
        console.error("[facettes] erreur réseau", err);
        if (!annule) setFacettes(null);
      } finally {
        if (!annule) setChargement(false);
      }
    })();

    return () => {
      annule = true;
    };
  }, [params]);

  return { facettes, chargement };
}
