import type { MetadataRoute } from "next";

/** Manifest PWA minimal — surtout pour l'icône 512px (favoris/écran d'accueil mobile), CONTRAT-V1 §8. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fidwastafid",
    short_name: "Fidwastafid",
    description: "Les meilleurs bons plans et promotions au Maroc, votés par la communauté.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f2",
    theme_color: "#1a0e06",
    icons: [{ src: "/icon-512", sizes: "512x512", type: "image/png" }],
  };
}
