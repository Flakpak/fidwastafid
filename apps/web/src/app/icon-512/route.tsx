import { ImageResponse } from "next/og";

/**
 * Icône 512px pour le manifest PWA (app/manifest.ts) — route normale (pas
 * la convention spéciale `icon`/`apple-icon`, réservée à une seule taille
 * chacune) : Next.js sait servir une ImageResponse depuis n'importe quel
 * handler GET. Même motif que apple-icon.tsx, plus de résolution.
 */
export function GET() {
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
        }}
      >
        <div
          style={{
            width: 420,
            height: 420,
            borderRadius: "50%",
            border: "16px solid #ffd43b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontFamily: "serif", fontSize: 160, fontWeight: 700, color: "#ffd43b", display: "flex" }}>
            فيد
          </div>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
