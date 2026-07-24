import type { Metadata } from "next";
import { inscriptionAction } from "../../lib/authActions.js";
import { safeNextPath } from "../../lib/nextPath.js";
import { SubmitButton } from "../../components/SubmitButton.js";
import { Input } from "../../components/Input.js";
import { buttonClasses } from "../../components/Button.js";

/** noindex — CONTRAT-V1 §2. */
export const metadata: Metadata = {
  title: "Inscription",
  robots: { index: false, follow: false },
};

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; etape?: string; next?: string }>;
}) {
  const { erreur, etape, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);

  if (etape === "verification") {
    return (
      <main className="min-h-screen bg-surface-base text-ink flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold mb-2">Vérifie ta boîte mail</h1>
          <p className="text-ink-muted">Un lien de confirmation vient de t&apos;être envoyé.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-base text-ink flex items-center justify-center p-6">
      <form
        action={inscriptionAction}
        className="w-full max-w-sm flex flex-col gap-4 bg-surface border border-border rounded-lg p-6"
      >
        <h1 className="font-arabic text-2xl text-ink">إنشاء حساب</h1>
        <p className="text-sm text-ink-muted">Inscription</p>
        {erreur && <p className="text-sm text-warn">Impossible de créer le compte.</p>}
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Pseudo
          <Input type="text" name="pseudo" required maxLength={40} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <Input type="email" name="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mot de passe
          <Input type="password" name="password" required minLength={8} />
        </label>
        <SubmitButton pendingLabel="Création du compte..." className={buttonClasses({ variant: "primary" })}>
          Créer mon compte
        </SubmitButton>
        <a
          href={next === "/" ? "/connexion" : `/connexion?next=${encodeURIComponent(next)}`}
          className="text-sm text-center text-accent hover:underline"
        >
          Déjà un compte ? Connecte-toi
        </a>
      </form>
    </main>
  );
}
