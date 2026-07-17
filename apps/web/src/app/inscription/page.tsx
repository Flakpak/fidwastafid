import type { Metadata } from "next";
import { inscriptionAction } from "../../lib/authActions.js";
import { safeNextPath } from "../../lib/nextPath.js";

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
      <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold mb-2">Vérifie ta boîte mail</h1>
          <p className="text-muted">Un lien de confirmation vient de t'être envoyé.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
      <form
        action={inscriptionAction}
        className="w-full max-w-sm flex flex-col gap-4 bg-white border border-bordure rounded-lg p-6"
      >
        <h1 className="font-arabic text-2xl text-rouge">إنشاء حساب</h1>
        <p className="text-sm text-muted">Inscription</p>
        {erreur && <p className="text-sm text-rouge">Impossible de créer le compte.</p>}
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Pseudo
          <input type="text" name="pseudo" required maxLength={40} className="border border-bordure rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="border border-bordure rounded px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mot de passe
          <input type="password" name="password" required minLength={8} className="border border-bordure rounded px-3 py-2" />
        </label>
        <button type="submit" className="bg-rouge text-white rounded px-4 py-2 font-bold">
          Créer mon compte
        </button>
        <a
          href={next === "/" ? "/connexion" : `/connexion?next=${encodeURIComponent(next)}`}
          className="text-sm text-center text-muted underline"
        >
          Déjà un compte ? Connecte-toi
        </a>
      </form>
    </main>
  );
}
