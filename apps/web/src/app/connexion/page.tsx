import type { Metadata } from "next";
import { connexionAction } from "../../lib/authActions.js";
import { safeNextPath } from "../../lib/nextPath.js";
import { SubmitButton } from "../../components/SubmitButton.js";
import { Input } from "../../components/Input.js";
import { buttonClasses } from "../../components/Button.js";

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
    <main className="min-h-screen bg-surface-base text-ink flex items-center justify-center p-6">
      <form
        action={connexionAction}
        className="w-full max-w-sm flex flex-col gap-4 bg-surface border border-border rounded-lg p-6"
      >
        <h1 className="font-arabic text-2xl text-ink">تسجيل الدخول</h1>
        <p className="text-sm text-ink-muted">Connexion</p>
        {erreur === "confirmation" && (
          <p className="text-sm text-warn">Lien de confirmation invalide ou expiré. Réessaie de t&apos;inscrire.</p>
        )}
        {erreur && erreur !== "confirmation" && <p className="text-sm text-warn">Identifiants invalides.</p>}
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <Input type="email" name="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mot de passe
          <Input type="password" name="password" required minLength={8} />
        </label>
        <SubmitButton pendingLabel="Connexion..." className={buttonClasses({ variant: "primary" })}>
          Se connecter
        </SubmitButton>
        <a
          href={next === "/" ? "/inscription" : `/inscription?next=${encodeURIComponent(next)}`}
          className="text-sm text-center text-accent hover:underline"
        >
          Pas de compte ? Inscris-toi
        </a>
        <a href="/mot-de-passe-oublie" className="text-xs text-center text-accent hover:underline">
          Mot de passe oublié ?
        </a>
      </form>
    </main>
  );
}
