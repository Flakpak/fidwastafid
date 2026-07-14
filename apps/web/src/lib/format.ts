/** Joint les fragments non vides avec " · " — utilisé pour les lignes méta
 *  (enseigne/ville/catégorie) qui doivent s'afficher proprement quand un
 *  champ optionnel (ex. enseigneSlug) est absent, sans "· " orphelin. */
export function joinMeta(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}
