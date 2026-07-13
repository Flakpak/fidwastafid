import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader.js";
import { AdminPipeline } from "./AdminPipeline.js";
import { resolveAdminGuardUser } from "../../lib/adminGuard.js";

/**
 * `metadata` en export statique ne suffit pas ici : un objet statique est
 * résolu par Next.js hors du rendu du composant de page, donc hors de
 * portée de toute garde posée dans le corps de `AdminPage()` (constaté
 * empiriquement — le <title> fuyait encore alors que le reste du markup
 * était bien bloqué). `generateMetadata()` est une fonction : elle peut
 * appeler `redirect()`/`notFound()` avant de renvoyer quoi que ce soit,
 * garde en tête, exactement comme la page. Voir CONTRAT-V1 §5.
 */
export async function generateMetadata(): Promise<Metadata> {
  const user = await resolveAdminGuardUser();
  if (!user) redirect("/connexion?next=/admin");
  if (!user.isAdmin) notFound();

  return {
    title: "Admin",
    robots: { index: false, follow: false },
  };
}

/**
 * Garde répétée ici, pas seulement dans layout.tsx ni generateMetadata() :
 * App Router rend layout, page et métadonnées indépendamment, une garde
 * seule n'empêche pas l'émission du payload RSC des autres. `React.cache()`
 * dans resolveAdminGuardUser() dédupe la résolution par requête.
 */
export default async function AdminPage() {
  const user = await resolveAdminGuardUser();
  if (!user) redirect("/connexion?next=/admin");
  if (!user.isAdmin) notFound();

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-black">Pipeline</h1>
        <AdminPipeline />
      </main>
    </div>
  );
}
