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
 * Charte Tadelakt (CONTRAT-V1 §8) : plâtre et encre, aucun dégradé, aucun
 * rouge ni or. UNE seule touche d'argan — le filet sous le sceau — conforme à
 * la règle « faible charge chromatique » : dans un fil social, l'image doit
 * se distinguer par son calme, pas par sa saturation.
 *
 * Aucune police n'est chargée explicitement : satori (next/og) rend avec ses
 * polices embarquées. Charger Scheherazade New exigerait un fetch réseau à
 * chaque génération d'image — un point de panne supplémentaire sur une route
 * publique, pour un gain typographique invisible à cette échelle. Le sceau
 * calligraphique complet reste porté par Seal.tsx dans l'UI, où la police est
 * bien appliquée.
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
          background: "#f4f1ec", // surface-base — plâtre
          color: "#1a1815", // ink
        }}
      >
        {/* Médaillon du sceau — anneau safran sur disque encre (§8, règle 4 :
            le safran est un ornement de marque, et le sceau en est le lieu).
            Construit en <div> imbriqués, PAS en <svg><text> : satori (next/og)
            ne sait pas rendre un nœud <text> ("please convert them to <path>").
            Même approche que apple-icon.tsx. */}
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: "50%",
            border: "3px solid #b07c2a", // safran
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 26,
          }}
        >
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: "50%",
              border: "2px solid #e0c793", // safran-line
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: "#1a1815", // ink
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F0D9A8",
                fontSize: 38,
                fontWeight: 700,
              }}
            >
              فيد
            </div>
          </div>
        </div>

        <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: "-0.02em", display: "flex" }}>
          فيد و ستافيد
        </div>

        {/* Unique touche d'argan de l'image (accent #2F6B57). */}
        <div style={{ width: 128, height: 3, background: "#2f6b57", marginTop: 24, display: "flex" }} />

        <div style={{ fontSize: 44, fontWeight: 600, marginTop: 28, letterSpacing: "-0.015em", display: "flex" }}>
          Fidwastafid
        </div>
        <div style={{ fontSize: 27, marginTop: 14, color: "#5c554b", display: "flex" }}>
          Les meilleurs bons plans au Maroc
        </div>
      </div>
    ),
    size
  );
}
