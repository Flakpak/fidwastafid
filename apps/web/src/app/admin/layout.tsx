import { notFound, redirect } from "next/navigation";
import { resolveAdminGuardUser } from "../../lib/adminGuard.js";

/**
 * Garde serveur pour tout /admin/* — doctrine d'accès admin (CONTRAT-V1 §5) :
 * aucun fragment HTML admin n'est envoyé à un non-admin, l'UI n'est jamais
 * la seule barrière. `headers()` (dans adminGuard.ts) fait basculer ce
 * sous-arbre en rendu dynamique — EFFET DÉSIRÉ, pas une lenteur à corriger :
 * une surface admin ne doit jamais être pré-rendue statiquement.
 *
 * Cette garde protège les futures sous-routes /admin/*, mais NE SUFFIT PAS
 * seule : layout et page se rendent en parallèle (App Router), voir la même
 * garde répétée dans page.tsx et la note gravée dans CONTRAT-V1 §5.
 *
 * `requireAdmin()` n'est volontairement pas utilisée ici : elle ne
 * distingue pas non-authentifié / non-admin (toujours FORBIDDEN, CONTRAT-V1
 * §5 — comportement voulu côté API, qui ne doit rien signaler). Le layout,
 * lui, doit distinguer les deux cas (redirect vs 404) : on part donc de
 * `getCurrentUser()`, déjà publique et inchangée.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await resolveAdminGuardUser();

  if (!user) redirect("/connexion?next=/admin");
  if (!user.isAdmin) notFound();

  return children;
}
