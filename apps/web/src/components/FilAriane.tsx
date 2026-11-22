import Link from "next/link";
import { breadcrumbJsonLd, type MaillonAriane } from "../lib/hubs.js";

/**
 * Fil d'Ariane visible + JSON-LD BreadcrumbList (lot SEO-3). Le dernier
 * maillon est la page courante : texte simple, `aria-current="page"`.
 */
export function FilAriane({ maillons }: { maillons: readonly MaillonAriane[] }) {
  // `<` échappé : un nom de deal soumis par un utilisateur ne doit jamais
  // pouvoir fermer la balise script (même garde que le JSON-LD de la fiche).
  const jsonLd = JSON.stringify(breadcrumbJsonLd(maillons)).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <nav aria-label="Fil d'Ariane" className="text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          {maillons.map((m, i) => (
            <li key={`${i}-${m.nom}`} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span aria-hidden="true">›</span>}
              {m.chemin ? (
                <Link href={m.chemin} className="font-bold hover:text-ink">
                  {m.nom}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink truncate max-w-[60vw]">
                  {m.nom}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
