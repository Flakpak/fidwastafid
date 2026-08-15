import { dealUrlSlug } from "@fidwastafid/schemas";
import { SITE_URL } from "../../../../lib/siteUrl.js";

/**
 * Construction du lien et de la légende d'une diffusion communautaire.
 * Fonctions PURES, isolées du client HTTP (_lib/telegram.ts) pour être
 * testables sans réseau — même découpage que shareText.ts pour le bouton
 * Partager.
 *
 * UTM — CONSTAT PRÉALABLE : aucun lien du site ne porte d'UTM aujourd'hui.
 * `ShareButton`/`shareText.ts` partagent l'URL nue. Il n'y avait donc AUCUNE
 * convention de code à reprendre : la seule référence écrite est
 * docs/IDEES.md § « Diffusion communautaire », qui fixe
 * `utm_source=<canal>&utm_medium=social&utm_campaign=diffusion`. C'est elle
 * qui est appliquée ici, à l'identique, pour que la lecture Vercel Analytics
 * prévue au même endroit fonctionne sans retraitement.
 */

export const UTM_MEDIUM = "social";
export const UTM_CAMPAIGN = "diffusion";

/** URL publique du deal, portant les UTM du canal. */
export function lienDiffusion(titre: string, publicId: string, canal: string, base: string = SITE_URL): string {
  const url = new URL(`/deal/${dealUrlSlug(titre, publicId)}`, base);
  url.searchParams.set("utm_source", canal);
  url.searchParams.set("utm_medium", UTM_MEDIUM);
  url.searchParams.set("utm_campaign", UTM_CAMPAIGN);
  return url.toString();
}

/** Échappe le strict nécessaire pour `parse_mode: HTML` côté Telegram. */
function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * WhatsApp n'a pas de mode HTML ni d'échappement — sa syntaxe légère
 * (`*gras*`, `~barré~`) EST le texte brut envoyé. Un titre ou un nom
 * d'enseigne portant l'un de ces trois caractères casserait la mise en
 * forme du reste du message (astérisque non refermé, etc.) : retirés ici
 * plutôt que risqué, un titre garde son sens sans eux.
 */
function nettoyerMarkupWhatsapp(texte: string): string {
  return texte.replace(/[*_~]/g, "");
}

/**
 * Légende WhatsApp — même contenu et même ordre que `buildLegendeTelegram`
 * (titre, enseigne, prix, lien), syntaxe adaptée (partage manuel, lot du
 * 15/08/2026, docs/IDEES.md § « Diffusion communautaire ») : `*gras*` au
 * lieu de `<b>`, `~barré~` au lieu de `<s>`, aucun lien markdown (WhatsApp
 * n'en interprète pas — une URL brute s'auto-lie déjà côté client).
 */
export function buildLegendeWhatsapp(params: {
  titre: string;
  prixPromo: number;
  prixNormal?: number | null;
  enseigneNom?: string | null;
  lien: string;
}): string {
  const { titre, prixPromo, prixNormal, enseigneNom, lien } = params;
  const pct = prixNormal && prixNormal > prixPromo ? Math.round((1 - prixPromo / prixNormal) * 100) : null;

  const lignes: string[] = [`*${nettoyerMarkupWhatsapp(titre)}*`];
  if (enseigneNom) lignes.push(nettoyerMarkupWhatsapp(enseigneNom));

  const prix =
    prixNormal && prixNormal > prixPromo
      ? `${prixPromo} DH  ~${prixNormal} DH~${pct !== null ? `  −${pct}%` : ""}`
      : `${prixPromo} DH`;
  lignes.push(prix);
  lignes.push(lien);

  return lignes.join("\n");
}

/**
 * Légende du message : titre, prix, lien.
 *
 * Le pourcentage n'est affiché que s'il est RÉELLEMENT calculable
 * (`prixNormal > prixPromo`) — même règle que `buildShareText` et que tout
 * le pipeline : jamais de remise devinée, y compris à l'affichage.
 */
export function buildLegendeTelegram(params: {
  titre: string;
  prixPromo: number;
  prixNormal?: number | null;
  enseigneNom?: string | null;
  lien: string;
}): string {
  const { titre, prixPromo, prixNormal, enseigneNom, lien } = params;
  const pct = prixNormal && prixNormal > prixPromo ? Math.round((1 - prixPromo / prixNormal) * 100) : null;

  const lignes: string[] = [`<b>${echapper(titre)}</b>`];
  if (enseigneNom) lignes.push(echapper(enseigneNom));

  const prix =
    prixNormal && prixNormal > prixPromo
      ? `${prixPromo} DH  <s>${prixNormal} DH</s>${pct !== null ? `  −${pct}%` : ""}`
      : `${prixPromo} DH`;
  lignes.push(prix);
  lignes.push(lien);

  return lignes.join("\n");
}
