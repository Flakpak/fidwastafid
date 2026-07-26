import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Enseigne } from "@fidwastafid/schemas";
import { AdminPipeline } from "./AdminPipeline.js";
import { Brand } from "../../components/Brand.js";
import { resolveCurrentUser } from "../../lib/currentUser.js";
import { GET as getEnseignesHandler } from "../api/v1/enseignes/route.js";

async function fetchEnseignes(): Promise<Enseigne[]> {
  const response = await getEnseignesHandler();
  const body = (await response.json()) as { data: Enseigne[] };
  return body.data;
}

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
  const user = await resolveCurrentUser();
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
 * dans resolveCurrentUser() dédupe la résolution par requête.
 */
export default async function AdminPage() {
  const user = await resolveCurrentUser();
  if (!user) redirect("/connexion?next=/admin");
  if (!user.isAdmin) notFound();

  // Liste des enseignes pour le <select> d'édition (AdminDealItem) — même
  // source que SoumettreForm (GET /api/v1/enseignes).
  const enseignes = await fetchEnseignes();

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      {/* Chrome admin volontairement INVERSÉ en encre (charte Tadelakt, écran
          08) : impossible de confondre l'admin et le site public d'un coup
          d'œil — seul écart assumé au système clair. */}
      <header className="bg-ink flex items-center gap-3 h-[60px] px-4 sm:px-6">
        {/* Variante sombre du wordmark — le chrome admin est inversé en encre. */}
        <Link href="/" className="shrink-0" aria-label="Fidwastafid — accueil">
          <Brand forme="wordmark" ton="sombre" hauteur={26} alt="" />
        </Link>
        <span className="text-[11px] font-medium tracking-[0.14em] uppercase text-surface-base/60 border border-surface-base/25 rounded px-2 py-0.5">
          Admin
        </span>
      </header>
      <main className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-black">Pipeline</h1>
        <AdminPipeline enseignes={enseignes} />
      </main>
    </div>
  );
}
