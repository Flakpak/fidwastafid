import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon PNG (32px, <link rel="icon">) — même famille visuelle que
 * favicon.ico (scripts/generate-favicon.ts) et apple-icon.tsx : anneau
 * plâtre sur fond encre (charte Tadelakt, CONTRAT-V1 §8, cohérent avec le
 * sceau du site). Trop petit pour le texte arabe du sceau complet
 * (Seal.tsx), donc motif simplifié — via next/og (déjà utilisé par
 * opengraph-image.tsx), pas de nouvelle dépendance.
 *
 * Pas d'argan (`accent`) ici : à 16 px, un vert sombre sur encre ne se
 * distingue plus. Seul le contraste encre/plâtre (15,7:1) survit à la
 * réduction.
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
          background: "#1a1815", // ink
          borderRadius: "50%",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2.5px solid #f4f1ec", // surface-base
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f4f1ec", display: "flex" }} />
        </div>
      </div>
    ),
    size
  );
}
