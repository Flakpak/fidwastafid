import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Icône apple-touch (180px) — assez de résolution pour reprendre le motif
 * du sceau complet (Seal.tsx : anneau plâtre sur fond encre + "فيد", charte
 * Tadelakt, cf. CONTRAT-V1 §8) plutôt que la version simplifiée du favicon
 * 16/32px. Couleurs seules : la forme calligraphique est non négociable.
 */
export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            width: 148,
            height: 148,
            borderRadius: "50%",
            border: "6px solid #f4f1ec", // surface-base
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontFamily: "serif", fontSize: 56, fontWeight: 700, color: "#f4f1ec", display: "flex" }}>
            فيد
          </div>
        </div>
      </div>
    ),
    size
  );
}
