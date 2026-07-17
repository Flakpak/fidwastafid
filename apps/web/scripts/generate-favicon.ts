import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Génère public/favicon.ico à la main — aucune dépendance de rasterisation
 * (sharp/etc.) n'existe dans ce monorepo, et en installer une juste pour un
 * favicon serait disproportionné. Le format ICO est simple (en-tête +
 * bitmap 32bpp) : on dessine directement les pixels d'un motif "sceau"
 * simplifié (anneau or sur fond sombre — CONTRAT-V1 §8), illisible en
 * détail à 16/32px de toute façon, cohérent avec le sceau complet
 * (Seal.tsx) utilisé ailleurs (icon.tsx/apple-icon.tsx, qui eux peuvent se
 * permettre plus de détail via next/og).
 */

const DARK: [number, number, number] = [0x1a, 0x0e, 0x06]; // seal-bg (le plus sombre du dégradé)
const GOLD: [number, number, number] = [0xff, 0xd4, 0x3b]; // --or

function drawSeal(size: number): Buffer {
  // BGRA, 32bpp, une ligne par ligne du bas vers le haut (convention BMP/ICO).
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.47;
  const ringInner = size * 0.36;
  const dotR = size * 0.1;

  for (let row = 0; row < size; row++) {
    // row 0 = bas de l'image en sortie ICO (bottom-up) — on dessine directement
    // dans cet ordre, le motif est symétrique donc l'orientation n'a pas d'importance.
    for (let col = 0; col < size; col++) {
      const dx = col + 0.5 - cx;
      const dy = row + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let color: [number, number, number] | null = null;
      if (dist <= dotR) {
        color = GOLD;
      } else if (dist <= outerR) {
        color = dist >= ringInner ? GOLD : DARK;
      }

      const offset = (row * size + col) * 4;
      if (color) {
        pixels[offset] = color[2]; // B
        pixels[offset + 1] = color[1]; // G
        pixels[offset + 2] = color[0]; // R
        pixels[offset + 3] = 0xff; // A
      }
      // sinon transparent (buffer déjà zéro-initialisé).
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

function buildIco(sizes: number[]): Buffer {
  const images = sizes.map((size) => bmpInfoHeaderAndMask(size, drawSeal(size)));

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

const ico = buildIco([16, 32, 48]);
const outPath = path.join(__dirname, "..", "public", "favicon.ico");
writeFileSync(outPath, ico);
console.log(`favicon.ico écrit (${ico.length} octets, tailles 16/32/48) — ${outPath}`);
