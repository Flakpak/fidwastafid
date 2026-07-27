import Link from "next/link";
import { resolveCurrentUser } from "../lib/currentUser.js";
import { deconnexionAction } from "../lib/authActions.js";
import { buttonClasses } from "./Button.js";
import { Brand } from "./Brand.js";

/**
 * État connecté/pseudo/lien admin résolu CÔTÉ SERVEUR (doctrine CONTRAT-V1
 * §5) — jamais un `if` côté client sur un état d'auth supposé. Le menu
 * déroulant utilise `<details>/<summary>` (natif HTML, zéro JS) plutôt
 * qu'un composant client : le contenu du menu (lien Admin, bouton
 * déconnexion) est déjà entièrement décidé par le serveur, il n'y a rien
 * à réévaluer côté client, donc rien à hydrater.
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : en-tête clair (`surface` + filet `border`),
 * marque = logotype vectoriel (lot 5). Wordmark seul — la baseline y serait
 * illisible et redondante avec le contenu de la page ; hauteur de capitale
 * ~22px, soit 30px de fichier (les capitales occupent 70 des 94 unités du
 * viewBox). Sous `sm`, le cadre est trop étroit pour 245px de wordmark : le
 * monogramme prend le relais. Une seule action pleine ici — « Soumettre un
 * deal » ; « Connexion » reste secondaire neutre.
 *
 * `collant` : l'en-tête est collant PAR LUI-MÊME sur toutes les pages sauf
 * l'accueil, où il est englobé avec la barre de filtres dans un unique
 * conteneur collant (lot 7, Feed.tsx). Deux éléments collants imbriqués
 * rouvriraient exactement l'écart par lequel le feed passait entre l'en-tête
 * et les filtres.
 */
export async function SiteHeader({ collant = true }: { collant?: boolean } = {}) {
  const user = await resolveCurrentUser();

  return (
    <header
      className={`bg-surface border-b border-border h-[60px] px-4 sm:px-6 flex items-center justify-between gap-3 ${
        collant ? "sticky top-0 z-10" : ""
      }`}
    >
      <Link href="/" className="shrink-0" aria-label="Fidwastafid — accueil">
        <Brand forme="mark" hauteur={32} alt="" className="sm:hidden" />
        <Brand forme="wordmark" hauteur={30} alt="" className="hidden sm:block" />
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
