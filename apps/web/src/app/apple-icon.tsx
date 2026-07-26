import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Icône apple-touch (180px) — monogramme FwS (CONTRAT-V1 §8, lot 5).
 *
 * Le fond `accent` occupe TOUT le canevas : une icône d'app ne flotte pas sur
 * du vide, c'est le système qui arrondit les coins. `mark.svg` porte déjà son
 * fond en `<rect>` plein bord à bord — il suffit donc de l'étirer au canevas,
 * sans marge ni disque intermédiaire.
 *
 * Le fichier est lu sur le disque et passé en data URI : satori ne résout pas
 * les chemins relatifs, et on ne redessine pas le tracé de référence (§8).
 * Route `nodejs` par défaut, `readFileSync` y est disponible.
 */
const markDataUri = `data:image/svg+xml;base64,${readFileSync(
  path.join(process.cwd(), "public", "brand", "mark.svg")
).toString("base64")}`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      // Fond accent sous le monogramme : le `rx` du fichier laisse ses coins
      // transparents, or iOS applique DÉJÀ son propre masque — sans ce fond,
      // les coins seraient arrondis deux fois et laisseraient voir le vide.
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#2f6b57" }}>
        <img src={markDataUri} width={180} height={180} alt="Fidwastafid" />
      </div>
    ),
    size
  );
}
