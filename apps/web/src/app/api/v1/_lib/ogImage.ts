/**
 * Extraction d'URL d'image depuis une page produit — POST
 * /api/v1/admin/deals/:publicId/image-depuis-lien (CONTRAT-V1 §4, troisième
 * amendement conscient du 19/07/2026). Regex volontaire, pas de parseur HTML
 * complet : suffisant pour cibler des balises <meta>/<link> dans du HTML
 * bien formé de pages marchandes réelles (Jumia et similaires), pas un
 * objectif de conformité HTML générale.
 */

const META_TAG_RE = /<meta\b[^>]*>/gi;
const LINK_TAG_RE = /<link\b[^>]*>/gi;

/** Attribut cherché sans supposer d'ordre (`property` peut précéder ou suivre `content`). */
function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = tag.match(re);
  if (!match) return null;
  return match[2] ?? match[3] ?? null;
}

function findMetaContent(html: string, names: string[]): string | null {
  const wanted = new Set(names);
  for (const tag of html.match(META_TAG_RE) ?? []) {
    const name = (extractAttr(tag, "property") ?? extractAttr(tag, "name"))?.toLowerCase();
    if (name && wanted.has(name)) {
      const content = extractAttr(tag, "content");
      if (content) return content;
    }
  }
  return null;
}

function findLinkImageSrc(html: string): string | null {
  for (const tag of html.match(LINK_TAG_RE) ?? []) {
    if (extractAttr(tag, "rel")?.toLowerCase() === "image_src") {
      const href = extractAttr(tag, "href");
      if (href) return href;
    }
  }
  return null;
}

/**
 * og:image, repli twitter:image, repli <link rel="image_src"> — ordre de
 * priorité demandé. Résout les URLs relatives contre l'URL de la page
 * (og:image est presque toujours absolu en pratique, mais rien ne l'impose).
 * `null` si aucune des trois sources n'est présente.
 */
export function extractImageUrl(html: string, pageUrl: string): string | null {
  const raw = findMetaContent(html, ["og:image", "og:image:secure_url"]) ?? findMetaContent(html, ["twitter:image", "twitter:image:src"]) ?? findLinkImageSrc(html);
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}
