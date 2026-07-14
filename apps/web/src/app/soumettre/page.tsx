import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import type { Enseigne } from "@fidwastafid/schemas";
import { GET as getEnseignesHandler } from "../api/v1/enseignes/route.js";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";
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
  const enseignes = await fetchEnseignes();
  // Nonce posé par middleware.ts (production uniquement) — nécessaire pour
  // que le <script> Turnstile (origine externe) soit accepté par le CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />

      <main className="max-w-xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-xl font-black">Proposer un bon plan</h1>
        <SoumettreForm enseignes={enseignes} />
      </main>
      <SiteFooter />
    </div>
  );
}
