import Link from "next/link";
import { resolveCurrentUser } from "../lib/currentUser.js";
import { deconnexionAction } from "../lib/authActions.js";
import { buttonClasses } from "./Button.js";

/**
 * État connecté/pseudo/lien admin résolu CÔTÉ SERVEUR (doctrine CONTRAT-V1
 * §5) — jamais un `if` côté client sur un état d'auth supposé. Le menu
 * déroulant utilise `<details>/<summary>` (natif HTML, zéro JS) plutôt
 * qu'un composant client : le contenu du menu (lien Admin, bouton
 * déconnexion) est déjà entièrement décidé par le serveur, il n'y a rien
 * à réévaluer côté client, donc rien à hydrater.
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : en-tête clair (`surface` + filet `border`),
 * sceau en encre (wordmark Scheherazade, à la place du médaillon coloré de la
 * v1). Une seule action pleine ici — « Soumettre un deal » ; « Connexion »
 * reste secondaire.
 */
export async function SiteHeader() {
  const user = await resolveCurrentUser();

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-10 h-[60px] px-4 sm:px-6 flex items-center justify-between gap-3">
      <Link href="/" aria-label="فيد و ستافيد" className="shrink-0">
        <span dir="rtl" className="font-arabic text-ink text-xl leading-none pb-[5px] inline-block">
          فيد و ستافيد
        </span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3">
        <Link href="/soumettre" className={buttonClasses({ variant: "primary", size: "sm" })}>
          <span className="sm:hidden" aria-hidden="true">
            +
          </span>
          <span className="hidden sm:inline">Soumettre un deal</span>
          <span className="sr-only sm:hidden">Soumettre un deal</span>
        </Link>
        {user ? (
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
              {user.pseudo}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="absolute right-0 mt-2 min-w-40 rounded-lg border border-border bg-surface py-1 shadow-lg z-20">
              {user.isAdmin && (
                <Link href="/admin" className="block px-4 py-2 text-sm text-ink-muted hover:bg-surface-subtle hover:text-ink">
                  Admin
                </Link>
              )}
              <Link href="/compte" className="block px-4 py-2 text-sm text-ink-muted hover:bg-surface-subtle hover:text-ink">
                Mon compte
              </Link>
              <form action={deconnexionAction}>
                <button
                  type="submit"
                  className="block w-full px-4 py-2 text-left text-sm text-ink-muted hover:bg-surface-subtle hover:text-ink"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </details>
        ) : (
          <Link href="/connexion" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Connexion
          </Link>
        )}
      </nav>
    </header>
  );
}
