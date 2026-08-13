// Mapping Bringo (Carrefour Maroc) titre + item_list_name + rayon →
// catégorie Fidwastafid. Extrait de scraper-bringo.mjs pour être partagé
// avec recategoriser-autre.mjs (passe rétroactive sur le stock existant) —
// une seule fonction, jamais deux copies qui dérivent.

// Extrait le rayon depuis l'URL de listing (dernier segment de chemin avant
// la query, ex. ".../tout-pour-votre-cuisine-4?limit=100" → "tout-pour-votre-cuisine-4").
// mapCategorie() ne recevait jusqu'ici que item_list_name, un champ de
// tracking peu fiable (souvent absent ou générique) — le rayon, lui, est
// TOUJOURS disponible : c'est l'URL qu'on vient d'appeler.
export function rayonDepuisUrl(url = "") {
  const sansQuery = url.split("?")[0];
  const segments = sansQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] || "";
}

// Mapping titre + item_list_name + rayon → catégorie Fidwastafid.
// Électroménager et Maison sont vérifiés AVANT Alimentaire : le catalogue
// Bringo contient des appareils ("Grill Viande…") et de la vaisselle
// ("Service Boisson…") dont le titre porte un mot-clé alimentaire sans être
// de la nourriture — mesuré sur les 713 titres réels classés "Autre"
// (docs/SUIVI.md, mesure du 08/08/2026).
export function mapCategorie(listName = "", titre = "", rayon = "") {
  const l = `${listName} ${titre}`.toLowerCase();

  if (
    /réfrigérateur|lave-linge|lave-vaisselle|\bfour\b|aspirateur|micro-onde|climatiseur|électroménager|blender|mixeur|hachoir|batteur|cafetière|machine à café|\bgrill\b|panini|crêpière|bouilloire|friteuse|air ?fry(?:er)?|multicuiseur|presse-agrume|centrifugeuse|extracteur de jus|grille-?pain|plancha|barbecue électrique|réchaud électrique/.test(
      l
    )
  )
    return "Électroménager";
  // Vaisselle et arts de la table sans catégorie propre dans l'enum
  // (packages/schemas/src/enums.ts) : rattachés à "Maison" — décision de
  // taxonomie du 08/08/2026, pas une déduction du code.
  if (
    /meuble|déco|cuisine|linge|jardin|bricolage|vaisselle|assiette|verre[s]? (?:à|a)|\bbol\b|\bmug\b|plateau|ramequin|saladier|boîte alimentaire|boite alimentaire|service (?:de table|boisson|saladier|vaisselle)|cloche|bocal|carafe|pichet|broc\b|tasse|gobelet|théière|sucrier|beurrier|nappe|serviette en papier|set de table|couteaux? en bois|cuillère/.test(
      l
    )
  )
    return "Maison";
  if (/fruit|légume|viande|poisson|épicerie|boisson|lait|fromage|surgelé|biscuit/.test(l)) return "Alimentaire";
  if (/tv|téléphone|ordinateur|souris|clavier|powerbank|casque|écouteur|câble|informatique|enceinte|audio|bluetooth|tablette|montre|console|chargeur/.test(l)) return "High-Tech";
  if (/vêtement|chaussure|mode/.test(l)) return "Mode";
  // shampoing/shampooing : les deux orthographes existent en usage réel
  // (constaté sur les titres carrefour.ma, 13/08/2026 : "SHAMPOOING GRAPE
  // MOISTURE" et "SHAMPOING FULL RESIST" cohabitent dans le même catalogue).
  if (/beauté|hygiène|parfum|shampo?oing/.test(l)) return "Beauté";
  // "Enfants" est absent de l'enum canonique (packages/schemas/src/enums.ts) —
  // comportement inchangé par ce lot (insert-deals.mjs, commentaire Phase 7A) :
  // ces deals sont rejetés en aval plutôt qu'insérés sous une catégorie corrigée.
  if (/bébé|enfant|jouet/.test(l)) return "Enfants";

  // Le rayon scrapé sert de dernier repli, pas de premier critère : un mot-clé
  // trouvé dans le titre est toujours plus précis qu'une catégorie déduite du
  // rayon entier (ex. de la vaisselle Maison figure dans le rayon cuisine).
  const r = rayon.toLowerCase();
  if (/high-tech/.test(r)) return "High-Tech";
  if (/cuisine/.test(r)) return "Maison";
  return "Autre";
}
