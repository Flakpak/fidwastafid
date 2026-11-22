// ============================================================
// FIDWASTAFID — Décodage des entités HTML dans les titres (lot SEO-2)
//
// Fait générateur (audit SEO du 22/11/2026) : 29 titres en base portaient
// des entités HTML brutes (`&rsquo;` ×26, `&#038;` ×5), toutes venues
// d'API WooCommerce (aswakassalam.com, ab-maroc.com) qui renvoient le nom
// produit encodé. Elles s'affichaient telles quelles (« SET D&rsquo;OUTILS »)
// et passaient dans le slug (`set-d-rsquo-outils-...`).
//
// Appelé à UN seul endroit : `mapDeal()` d'insert-deals.mjs, point de
// passage commun à tous les scrapers. Il remplace le décodage ponctuel de
// `&#8211;` qui existait dans scraper-aswakassalam.mjs.
//
// Pas de repli silencieux : une entrée qui n'est pas une chaîne lève une
// erreur au lieu de passer telle quelle, et aucune erreur de `decodeHTML`
// n'est interceptée ici.
// ============================================================

import { decodeHTML } from "entities";

export function decoderEntitesHtml(texte) {
  if (typeof texte !== "string") {
    throw new TypeError(`decoderEntitesHtml : chaîne attendue, reçu ${texte === null ? "null" : typeof texte}`);
  }
  return decodeHTML(texte);
}
