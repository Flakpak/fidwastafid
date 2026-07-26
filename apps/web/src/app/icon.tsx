import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon PNG (32px, <link rel="icon">) — monogramme FwS à rayon d'angle
 * RÉDUIT (`mark-16.svg`, CONTRAT-V1 §8, lot 5) : à cette taille, le `rx` de
 * 22 % de `mark.svg` ronge les lettres. Même fichier que le `.ico` généré par
 * scripts/generate-favicon.ts, pour que les deux voies restent identiques.
 *
 * Fond `accent` bord à bord — porté par le `<rect>` du fichier lui-même.
 */
const mark16DataUri = `data:image/svg+xml;base64,${readFileSync(
  path.join(process.cwd(), "public", "brand", "mark-16.svg")
).toString("base64")}`;

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={mark16DataUri} width={32} height={32} alt="Fidwastafid" />
      </div>
    ),
    size
  );
}
