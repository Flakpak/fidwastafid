import type { MetadataRoute } from "next";

/**
 * Manifest PWA minimal — surtout pour l'icône 512px (favoris/écran d'accueil
 * mobile), CONTRAT-V1 §8.
 *
 * Charte Tadelakt : les deux couleurs passent au plâtre (`surface-base`).
 * `theme_color` teinte la barre système / d'adresse en mobile — l'ancienne
 * valeur sombre (#1a0e06) datait d'un chrome sombre qui n'existe plus depuis
 * la migration du header et du ticker en clair ; la garder produirait une
 * barre foncée au-dessus d'une page plâtre.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fidwastafid",
    short_name: "Fidwastafid",
    description: "Les meilleurs bons plans et promotions au Maroc, votés par la communauté.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ec", // surface-base
    theme_color: "#f4f1ec", // surface-base
    icons: [{ src: "/icon-512", sizes: "512x512", type: "image/png" }],
  };
}
