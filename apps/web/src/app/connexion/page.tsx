import type { Metadata } from "next";
import { connexionAction } from "../../lib/authActions.js";
import { safeNextPath } from "../../lib/nextPath.js";

/** noindex — CONTRAT-V1 §2. */
export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; next?: string }>;
}) {
  const { erreur, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  return (
    <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
      <form
        action={connexionAction}
        className="w-full max-w-sm flex flex-col gap-4 bg-white border border-bordure rounded-lg p-6"
      >
        <h1 className="font-arabic text-2xl text-rouge">تسجيل الدخول</h1>
        <p className="text-sm text-muted">Connexion</p>
        {erreur === "confirmation" && (
          <p className="text-sm text-rouge">
            Lien de confirmation invalide ou expiré. Réessaie de t&apos;inscrire.
          </p>
        )}
        {erreur && erreur !== "confirmation" && <p className="text-sm text-rouge">Identifiants invalides.</p>}
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="border border-bordure rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mot de passe
          <input type="password" name="password" required minLength={8} className="border border-bordure rounded px-3 py-2" />
        </label>
        <button type="submit" className="bg-rouge text-white rounded px-4 py-2 font-bold">
          Se connecter
        </button>
        <a
          href={next === "/" ? "/inscription" : `/inscription?next=${encodeURIComponent(next)}`}
          className="text-sm text-center text-muted underline"
        >
          Pas de compte ? Inscris-toi
        </a>
      </form>
    </main>
  );
}
