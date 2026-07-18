import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveCurrentUser } from "../../lib/currentUser.js";
import { reinitialiserMotDePasseAction } from "../../lib/authActions.js";

/** noindex — CONTRAT-V1 §2, même famille que /connexion. */
export const metadata: Metadata = {
  title: "Réinitialiser le mot de passe",
  robots: { index: false, follow: false },
};

type PageParams = {
  searchParams: Promise<{ token_hash?: string; type?: string; erreur?: string }>;
};

function NouveauMotDePasseForm({ erreur }: { erreur?: string }) {
  return (
    <form
      action={reinitialiserMotDePasseAction}
      className="w-full max-w-sm flex flex-col gap-4 bg-white border border-bordure rounded-lg p-6"
    >
      <h1 className="text-2xl font-bold text-rouge">Nouveau mot de passe</h1>
      {erreur === "confirmation" && (
        <p className="text-sm text-rouge">Les deux mots de passe ne correspondent pas.</p>
      )}
      {erreur === "echec" && <p className="text-sm text-rouge">Réinitialisation impossible, réessaie.</p>}
      <label className="flex flex-col gap-1 text-sm">
        Nouveau mot de passe
        <input type="password" name="password" required minLength={8} className="border border-bordure rounded px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirme le mot de passe
        <input
          type="password"
          name="passwordConfirmation"
          required
          minLength={8}
          className="border border-bordure rounded px-3 py-2"
        />
      </label>
      <button type="submit" className="bg-rouge text-white rounded px-4 py-2 font-bold">
        Enregistrer
      </button>
    </form>
  );
}

function LienInvalide() {
  return (
    <div className="max-w-sm text-center bg-white border border-bordure rounded-lg p-6 flex flex-col gap-3">
      <h1 className="text-xl font-bold">Lien invalide ou expiré</h1>
      <p className="text-muted">
        Ce lien de réinitialisation n&apos;est plus valable — il n&apos;est utilisable qu&apos;une fois et expire
        après un certain délai.
      </p>
      <Link href="/mot-de-passe-oublie" className="text-sm text-bleu font-bold hover:underline">
        Demander un nouveau lien
      </Link>
    </div>
  );
}

/**
 * Cette page ne vérifie plus jamais `token_hash` elle-même — un Server
 * Component ne peut pas poser de cookie pendant son rendu (Next.js 15
 * l'interdit hors Server Action / Route Handler). C'est /auth/reset/route.ts
 * qui fait `verifyOtp` + pose le cookie de session, puis redirige ici sans
 * paramètres. Incident du 18/07/2026 (digest 773635100) : la vérification
 * vivait auparavant ici, et plantait en 500 dès qu'un vrai token passait.
 *
 * Si `token_hash`/`type` arrivent quand même sur CETTE page (ancien lien
 * email déjà envoyé, ou gabarit Supabase pas encore mis à jour), on les
 * relaie vers /auth/reset plutôt que de planter ou de les ignorer —
 * `redirect()` ne touche pas aux cookies, autorisé n'importe où.
 *
 * Le formulaire de nouveau mot de passe n'est rendu QUE si une session de
 * récupération est déjà posée en cookie (par /auth/reset) — jamais sur la
 * seule foi d'un `token_hash` en query, qui n'a pas encore été vérifié ici.
 */
export default async function ReinitialiserMotDePassePage({ searchParams }: PageParams) {
  const { token_hash: tokenHash, type, erreur } = await searchParams;

  if (tokenHash && type === "recovery") {
    redirect(`/auth/reset?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
  }

  if (erreur === "invalide") {
    return (
      <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
        <LienInvalide />
      </main>
    );
  }

  const user = await resolveCurrentUser();
  if (!user) redirect("/mot-de-passe-oublie");

  return (
    <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
      <NouveauMotDePasseForm erreur={erreur === "confirmation" || erreur === "echec" ? erreur : undefined} />
    </main>
  );
}
