import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { headers } from "next/headers";
import type { Enseigne } from "@fidwastafid/schemas";
import { GET as getEnseignesHandler } from "../api/v1/enseignes/route.js";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";
import { resolveCurrentUser } from "../../lib/currentUser.js";
import { SoumettreForm } from "./SoumettreForm.js";

export const metadata: Metadata = {
  title: "Proposer un bon plan",
  robots: { index: false, follow: false },
};

/** SSR par requête — mêmes raisons que le feed (voir app/page.tsx). */
export const dynamic = "force-dynamic";

async function fetchEnseignes(): Promise<Enseigne[]> {
  const response = await getEnseignesHandler();
  const body = (await response.json()) as { data: Enseigne[] };
  return body.data;
}

export default async function SoumettrePage() {
  const [enseignes, user] = await Promise.all([fetchEnseignes(), resolveCurrentUser()]);
  // Nonce posé par middleware.ts (production uniquement) — nécessaire pour
  // que le <script> Turnstile (origine externe) soit accepté par le CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-black">Proposer un bon plan</h1>

        {/*
         * Le formulaire reste accessible à tous (on ne bloque pas l'accès,
         * cf. l'élan de contribution) — mais un visiteur non connecté est
         * prévenu tout de suite plutôt que de découvrir l'échec au submit
         * (premier filet ; le second vit dans SoumettreForm au moment de
         * l'envoi, pour le cas où la session expire entre-temps).
         */}
        {!user && (
          <div className="bg-creme border-2 border-or/70 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
            <p className="text-sm font-bold">Tu dois être connecté pour publier ton bon plan.</p>
            <div className="flex gap-4 text-sm font-bold">
              <Link href="/connexion?next=/soumettre" className="text-bleu hover:underline">
                Se connecter
              </Link>
              <Link href="/inscription?next=/soumettre" className="text-bleu hover:underline">
                Créer un compte
              </Link>
            </div>
          </div>
        )}

        <SoumettreForm enseignes={enseignes} />
      </main>
      <SiteFooter />
    </div>
  );
}
