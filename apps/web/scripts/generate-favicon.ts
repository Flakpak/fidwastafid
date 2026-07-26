import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Génère public/favicon.ico depuis le monogramme vectoriel de référence
 * (public/brand/mark-16.svg — CONTRAT-V1 §8, lot 5).
 *
 * Le tracé n'est jamais redessiné : il est RASTÉRISÉ par sharp, déjà présent
 * dans apps/web pour le traitement des images de deals. (Le commentaire
 * historique de ce fichier affirmait qu'aucune dépendance de rasterisation
 * n'existait dans le monorepo — c'était vrai avant l'arrivée de sharp ; le
 * motif était alors dessiné pixel par pixel à la main.)
 *
 * `mark-16.svg` et non `mark.svg` : à 16/32 px, le rayon d'angle de 22 % de la
 * version standard ronge les lettres. Le fichier 16 porte un rayon réduit,
 * pensé pour cette taille — c'est le même que sert `icon.tsx`, les deux voies
 * restent donc identiques.
 *
 * Le format ICO est assemblé à la main (en-tête + bitmaps 32bpp) : aucune
 * bibliothèque du projet ne l'écrit, et le format est trivial.
 */

const SOURCE = path.join(__dirname, "..", "public", "brand", "mark-16.svg");
const svg = readFileSync(SOURCE);

/**
 * Rastérise le SVG à `size` px et renvoie les pixels au format attendu par
 * ICO : BGRA 32bpp, lignes du bas vers le haut (convention BMP).
 */
async function rasterise(size: number): Promise<Buffer> {
  const { data } = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.alloc(size * size * 4);
  for (let row = 0; row < size; row++) {
    // Ligne 0 de la sortie ICO = bas de l'image : on lit la source à l'envers.
    const srcRow = size - 1 - row;
    for (let col = 0; col < size; col++) {
      const s = (srcRow * size + col) * 4;
      const d = (row * size + col) * 4;
      pixels[d] = data[s + 2]!; // B
      pixels[d + 1] = data[s + 1]!; // G
      pixels[d + 2] = data[s]!; // R
      pixels[d + 3] = data[s + 3]!; // A
    }
  }
  return pixels;
}

function bmpInfoHeaderAndMask(size: number, colorData: Buffer): Buffer {
  const header = Buffer.alloc(40);
  header.writeInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (double : XOR + AND mask, convention ICO)
  header.writeInt16LE(1, 12); // biPlanes
  header.writeInt16LE(32, 14); // biBitCount
  header.writeInt32LE(0, 16); // BI_RGB, pas de compression
  header.writeInt32LE(colorData.length, 20); // biSizeImage

  // Masque AND : 1bpp, chaque ligne paddée à un multiple de 4 octets.
  // Inutilisé en pratique (l'alpha 32bpp prime), mais requis par le format.
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size, 0);

  return Buffer.concat([header, colorData, mask]);
}

async function buildIco(sizes: number[]): Promise<Buffer> {
  const images = await Promise.all(
    sizes.map(async (size) => bmpInfoHeaderAndMask(size, await rasterise(size)))
  );

  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // type = icon
  iconDir.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries: Buffer[] = [];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]!;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(images[i]!.length, 8); // taille des données
    entry.writeUInt32LE(offset, 12); // offset dans le fichier
    offset += images[i]!.length;
    entries.push(entry);
  }

  return Buffer.concat([iconDir, ...entries, ...images]);
}

const ico = await buildIco([16, 32, 48]);
const outPath = path.join(__dirname, "..", "public", "favicon.ico");
writeFileSync(outPath, ico);
console.log(`favicon.ico écrit (${ico.length} octets, tailles 16/32/48) — ${outPath}`);
