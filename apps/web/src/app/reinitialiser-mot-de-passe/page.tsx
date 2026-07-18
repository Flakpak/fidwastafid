import type { Metadata } from "next";
import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthClient } from "../../lib/supabaseAuthClient.js";
import { setSessionCookie } from "../../lib/sessionCookie.js";
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
 * `token_hash` + `verifyOtp({ type: "recovery" })` — même mécanisme que
 * /auth/confirm (voir ce fichier pour le détail : notre client Supabase
 * n'a jamais fixé `flowType`, donc `'implicit'` par défaut, PKCE hors jeu).
 *
 * Le formulaire de nouveau mot de passe n'est rendu QUE dans la même
 * requête qu'une vérification `verifyOtp` réussie (`token_hash` valide) —
 * jamais via une simple présence de cookie de session, qui pourrait être
 * celui d'un utilisateur normal arrivé ici par hasard. Après un aller-retour
 * côté action (mismatch de confirmation, échec de mise à jour), la page est
 * revisitée sans `token_hash` : la session de récupération déjà posée en
 * cookie (par le premier passage) sert alors de preuve à la place.
 */
export default async function ReinitialiserMotDePassePage({ searchParams }: PageParams) {
  const { token_hash: tokenHash, type, erreur } = await searchParams;

  if (tokenHash && type === "recovery") {
    const { data, error } = await getAuthClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error || !data.session) {
      redirect("/reinitialiser-mot-de-passe?erreur=invalide");
    }
    await setSessionCookie(data.session.access_token, data.session.expires_in);

    return (
      <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
        <NouveauMotDePasseForm />
      </main>
    );
  }

  if (erreur === "invalide") {
    return (
      <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
        <LienInvalide />
      </main>
    );
  }

  if (erreur === "confirmation" || erreur === "echec") {
    const user = await resolveCurrentUser();
    if (!user) redirect("/mot-de-passe-oublie");

    return (
      <main className="min-h-screen bg-creme text-texte flex items-center justify-center p-6">
        <NouveauMotDePasseForm erreur={erreur} />
      </main>
    );
  }

  // Accès direct, sans lien — rien à vérifier ni à afficher ici.
  redirect("/mot-de-passe-oublie");
}
