import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Icône 512px pour le manifest PWA (app/manifest.ts) — route normale (pas
 * la convention spéciale `icon`/`apple-icon`, réservée à une seule taille
 * chacune) : Next.js sait servir une ImageResponse depuis n'importe quel
 * handler GET. Même monogramme que apple-icon.tsx, plus de résolution, fond
 * `accent` occupant tout le canevas (CONTRAT-V1 §8, lot 5).
 */
const markDataUri = `data:image/svg+xml;base64,${readFileSync(
  path.join(process.cwd(), "public", "brand", "mark.svg")
).toString("base64")}`;

export function GET() {
  return new ImageResponse(
    (
      // Fond accent sous le monogramme — même raison que apple-icon.tsx : le
      // système arrondit les coins lui-même, l'icône ne doit pas flotter.
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2f6b57" }}>
        <img src={markDataUri} width={512} height={512} alt="Fidwastafid" />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
