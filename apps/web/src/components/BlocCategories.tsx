import Link from "next/link";
import { evenementParSlug, etatEvenement } from "../lib/hubs.js";
import { aujourdhuiCasablanca, categoriesIndexables } from "../app/api/v1/_lib/hubs.js";

/**
 * Bloc « Catégories » de l'accueil (lot SEO-3) : catégories indexables avec
 * leur nombre de deals actifs, et lien mis en avant vers la page Black
 * Friday pendant la fenêtre de son édition (jour fourni par Postgres).
 */
export async function BlocCategories() {
  const blackFriday = evenementParSlug("black-friday");
  const [indexables, aujourdhui] = await Promise.all([categoriesIndexables(), aujourdhuiCasablanca()]);
  const edition = blackFriday ? etatEvenement(blackFriday, aujourdhui).edition : null;

  if (indexables.length === 0 && !edition) return null;

  return (
    <section aria-labelledby="bloc-categories" className="mt-4 flex flex-col gap-2">
      {edition && (
        <Link
          href="/bons-plans/black-friday"
          className="block rounded-2xl bg-ink text-surface px-4 py-3 font-black hover:opacity-90"
        >
          {edition.h1} →
        </Link>
      )}
      {indexables.length > 0 && (
        <>
          <h2 id="bloc-categories" className="text-lg font-black">
            Catégories
          </h2>
          <ul className="flex flex-wrap gap-2">
            {indexables.map((c) => (
              <li key={c.hub.slug}>
                <Link
                  href={`/categorie/${c.hub.slug}`}
                  className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-sm font-bold hover:border-border-strong"
                >
                  {c.hub.categorie}
                  <span className="ml-1 text-ink-muted font-normal">({c.nombre})</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
