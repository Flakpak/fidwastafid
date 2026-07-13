import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Image Open Graph par défaut, générique pour tout le site — aucun deal n'a
 * encore de vraie photo (`imageKey`/`/img/deals/[public_id]` réservés en
 * CONTRAT-V1 §6, jamais construits, pas de formulaire d'upload). À
 * remplacer par une image par deal quand ce pipeline existera ; une page
 * qui définit son propre `opengraph-image` prendrait le dessus sur celle-ci.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f03e3e",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700 }}>فيدوستافيد</div>
        <div style={{ fontSize: 40, fontWeight: 800, marginTop: 16 }}>Fidwastafid</div>
        <div style={{ fontSize: 28, marginTop: 24, opacity: 0.9 }}>Les meilleurs bons plans au Maroc</div>
      </div>
    ),
    size
  );
}
