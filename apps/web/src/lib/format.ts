/** Joint les fragments non vides avec " · " — utilisé pour les lignes méta
 *  (enseigne/ville/catégorie) qui doivent s'afficher proprement quand un
 *  champ optionnel (ex. enseigneSlug) est absent, sans "· " orphelin. */
export function joinMeta(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}

/** Date relative courte ("il y a Xmin/h/j") — porté tel quel depuis le
 *  DealCard de v1 (index.html racine). */
export function relativeDate(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffMin < 1440) return `il y a ${Math.floor(diffMin / 60)}h`;
  return `il y a ${Math.floor(diffMin / 1440)}j`;
}
