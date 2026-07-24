import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import Link from "next/link";
import { motDePasseOublieAction } from "../../lib/authActions.js";
import { SubmitButton } from "../../components/SubmitButton.js";
import { Input } from "../../components/Input.js";
import { buttonClasses } from "../../components/Button.js";

/** noindex — CONTRAT-V1 §2, même famille que /connexion. */
export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default async function MotDePasseOubliePage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; etape?: string }>;
}) {
  const { erreur, etape } = await searchParams;
  // Nonce posé par middleware.ts (production uniquement) — même besoin que
  // /soumettre : cette page envoie un email, donc protégée par Turnstile.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  if (etape === "envoye") {
    return (
      <main className="min-h-screen bg-surface-base text-ink flex items-center justify-center p-6">
        <div className="max-w-sm text-center bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-bold mb-2">Vérifie ta boîte mail</h1>
          {/* Réponse volontairement identique, que l'email corresponde à un
              compte ou non — jamais de révélation d'existence de compte. */}
          <p className="text-ink-muted">Si un compte existe avec cette adresse, un email a été envoyé.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-base text-ink flex items-center justify-center p-6">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />
      <form
        action={motDePasseOublieAction}
        className="w-full max-w-sm flex flex-col gap-4 bg-surface border border-border rounded-lg p-6"
      >
        <h1 className="text-2xl font-bold text-ink">Mot de passe oublié</h1>
        <p className="text-sm text-ink-muted">Indique ton email, on t&apos;envoie un lien pour le réinitialiser.</p>
        {erreur === "turnstile" && <p className="text-sm text-warn">Vérification anti-robot échouée, réessaie.</p>}
        {erreur === "limite" && <p className="text-sm text-warn">Trop de demandes, réessaie plus tard.</p>}
        <label className="flex flex-col gap-1 text-sm">
          Email
          <Input type="email" name="email" required />
        </label>
        <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
        <SubmitButton pendingLabel="Envoi..." className={buttonClasses({ variant: "primary" })}>
          Envoyer le lien
        </SubmitButton>
        <Link href="/connexion" className="text-sm text-center text-accent hover:underline">
          Retour à la connexion
        </Link>
      </form>
    </main>
  );
}
