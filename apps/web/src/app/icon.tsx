import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon PNG (32px, <link rel="icon">) — même famille visuelle que
 * favicon.ico (scripts/generate-favicon.ts) et apple-icon.tsx : anneau or
 * sur fond sombre (CONTRAT-V1 §8, cohérent avec le sceau du footer). Trop
 * petit pour le texte arabe du sceau complet (Seal.tsx), donc motif
 * simplifié — via next/og (déjà utilisé par opengraph-image.tsx), pas de
 * nouvelle dépendance.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a0e06",
          borderRadius: "50%",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2.5px solid #ffd43b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffd43b", display: "flex" }} />
        </div>
      </div>
    ),
    size
  );
}
