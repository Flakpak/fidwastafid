/**
 * Valide un paramètre `next` (post-connexion/inscription) : uniquement un
 * chemin relatif interne commençant par un seul "/" — jamais une URL
 * absolue (http://...), jamais "//" ou "/\" (interprétés comme
 * protocol-relatifs par certains navigateurs) — ferme tout vecteur d'open
 * redirect. Retombe sur "/" si absent ou invalide. Utilisé à la fois côté
 * pages (searchParams) et côté server actions (FormData), d'où la
 * signature générique.
 */
export function safeNextPath(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
