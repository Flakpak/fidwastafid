import Link from "next/link";
import { resolveCurrentUser } from "../lib/currentUser.js";
import { deconnexionAction } from "../lib/authActions.js";
import { Seal } from "./Seal.js";

/**
 * État connecté/pseudo/lien admin résolu CÔTÉ SERVEUR (doctrine CONTRAT-V1
 * §5) — jamais un `if` côté client sur un état d'auth supposé. Le menu
 * déroulant utilise `<details>/<summary>` (natif HTML, zéro JS) plutôt
 * qu'un composant client : le contenu du menu (lien Admin, bouton
 * déconnexion) est déjà entièrement décidé par le serveur, il n'y a rien
 * à réévaluer côté client, donc rien à hydrater.
 */
export async function SiteHeader() {
  const user = await resolveCurrentUser();

  return (
    <header className="bg-white border-b-2 border-bordure sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
      <Link href="/" aria-label="فيدوستافيد">
        <Seal className="w-11 h-11" />
      </Link>
      <nav className="flex items-center gap-4 text-sm font-bold">
        <Link href="/soumettre" className="text-muted hover:text-rouge">
          Proposer un bon plan
        </Link>
        {user ? (
          <details className="relative">
            <summary className="cursor-pointer list-none text-muted hover:text-rouge">{user.pseudo} ▾</summary>
            <div className="absolute right-0 mt-2 bg-white border border-bordure rounded-lg shadow-lg py-1 min-w-40 z-20">
              {user.isAdmin && (
                <Link href="/admin" className="block px-4 py-2 text-sm hover:bg-creme">
                  Admin
                </Link>
              )}
              <Link href="/compte" className="block px-4 py-2 text-sm hover:bg-creme">
                Mon compte
              </Link>
              <form action={deconnexionAction}>
                <button type="submit" className="block w-full text-left px-4 py-2 text-sm text-rouge hover:bg-creme">
                  Déconnexion
                </button>
              </form>
            </div>
          </details>
        ) : (
          <Link href="/connexion" className="text-muted hover:text-rouge">
            Connexion
          </Link>
        )}
      </nav>
    </header>
  );
}
