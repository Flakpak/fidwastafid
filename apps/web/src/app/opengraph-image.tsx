import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Image Open Graph par défaut, générique pour tout le site. Une page qui
 * définit son propre `opengraph-image` prend le dessus sur celle-ci — c'est
 * le cas de la page deal, qui sert la photo produit (voir
 * deal/[slugAndId]/page.tsx, `dealOgImages`) et n'est donc pas concernée par
 * ce fichier.
 *
 * Charte Tadelakt (CONTRAT-V1 §8, lot 5) : logotype complet AVEC baseline sur
 * champ plâtre. Le logo porte à lui seul l'accent et le safran — rien d'autre
 * n'est ajouté, conformément à la faible charge chromatique.
 *
 * Le SVG est en tracés (`<path>`/`<rect>`), donc le refus des nœuds `<text>`
 * par satori (incident du lot 3) ne s'applique plus : le fichier est lu sur
 * le disque et passé en data URI, jamais redessiné (§8).
 *
 * Zone de protection : le logotype occupe 880px de large sur un canevas de
 * 1200, soit ~160px de marge de part et d'autre — bien au-delà de la hauteur
 * de capitale exigée.
 */
const logoDataUri = `data:image/svg+xml;base64,${readFileSync(
  path.join(process.cwd(), "public", "brand", "logo-full.svg")
).toString("base64")}`;

/** Ratio du viewBox de logo-full.svg (768 × 133,2). */
const LARGEUR = 880;
const HAUTEUR = Math.round((LARGEUR * 133.2) / 768);

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f1ec", // surface-base — plâtre
        }}
      >
        <img src={logoDataUri} width={LARGEUR} height={HAUTEUR} alt="Fidwastafid" />
      </div>
    ),
    size
  );
}
