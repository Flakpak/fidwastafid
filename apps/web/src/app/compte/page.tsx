import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dealUrlSlug } from "@fidwastafid/schemas";
import { resolveCurrentUser } from "../../lib/currentUser.js";
import { buildMe } from "../api/v1/_lib/me.js";
import { SiteHeader } from "../../components/SiteHeader.js";
import { SiteFooter } from "../../components/SiteFooter.js";
import { relativeDate } from "../../lib/format.js";
import { IdentiteForm } from "./IdentiteForm.js";
import { SupprimerCompteButton } from "./SupprimerCompteButton.js";

/** noindex — page de compte, jamais indexable (même famille que /connexion, /admin). */
export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

/** Résolu à chaque requête (état du profil), jamais pré-rendu — même raison que /admin/*. */
export const dynamic = "force-dynamic";

const STATUT_BADGE: Record<string, { label: string; classes: string }> = {
  publie: { label: "Publié", classes: "bg-vert/10 text-vert" },
  en_attente: { label: "En attente", classes: "bg-avatar-or/10 text-avatar-or" },
  rejete: { label: "Refusé", classes: "bg-creme text-muted" },
  expire: { label: "Expiré", classes: "bg-creme text-muted" },
  auto_draft: { label: "Brouillon", classes: "bg-creme text-muted" },
};

export default async function ComptePage() {
  const user = await resolveCurrentUser();
  if (!user) redirect("/connexion?next=/compte");

  const me = await buildMe(user);

  return (
    <div className="min-h-screen bg-creme text-texte">
      <SiteHeader />
      <main className="max-w-6xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-black">Mon compte</h1>

        {/* Carte a — identité. */}
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8">
          <h2 className="text-lg font-black mb-4">Mon identité</h2>
          <IdentiteForm pseudoInitial={me.pseudo} couleurInitiale={me.couleurAvatar} />
        </div>

        {/* Carte b — contributions. */}
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-5">
          <h2 className="text-lg font-black">Mes contributions</h2>

          <div className="flex items-center gap-8">
            <div>
              <p className="text-3xl font-black text-rouge">{me.dealsCount}</p>
              <p className="text-xs font-bold text-muted">deals partagés</p>
            </div>
            <div>
              <p className="text-3xl font-black text-rouge">{me.votesCount}</p>
              <p className="text-xs font-bold text-muted">votes</p>
            </div>
            <div>
              <p className="text-3xl font-black text-rouge">{me.commentairesCount}</p>
              <p className="text-xs font-bold text-muted">commentaires</p>
            </div>
          </div>

          {me.mesDeals.length > 0 && (
            <ul className="flex flex-col gap-2">
              {me.mesDeals.map((d) => {
                const badge = STATUT_BADGE[d.statut] ?? { label: d.statut, classes: "bg-creme text-muted" };
                const titre =
                  d.statut === "publie" ? (
                    <Link href={`/deal/${dealUrlSlug(d.titre, d.publicId)}`} className="font-semibold hover:text-rouge">
                      {d.titre}
                    </Link>
                  ) : (
                    <span className="font-semibold">{d.titre}</span>
                  );
                return (
                  <li
                    key={d.publicId}
                    className="flex items-center justify-between gap-3 border-t border-bordure pt-2 text-sm"
                  >
                    <div className="min-w-0">
                      {titre}
                      <p className="text-xs text-muted">{relativeDate(d.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-bold rounded-full px-2.5 py-1 ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Carte c — données. */}
        <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 flex flex-col gap-3">
          <h2 className="text-lg font-black">Mes données</h2>
          <div>
            <p className="text-xs font-bold text-muted mb-1">Email</p>
            <p className="text-sm text-muted bg-creme rounded-lg px-3 py-2">{me.email}</p>
            <p className="text-xs text-muted mt-1">Identifiant de connexion — non modifiable ici.</p>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Fidwastafid conserve ton email, ton pseudo, ta couleur d&apos;avatar et l&apos;historique de tes
            contributions (deals, votes, commentaires) pour faire fonctionner ton compte et afficher tes
            contributions à la communauté. Détails complets :{" "}
            <Link href="/confidentialite" className="text-bleu font-bold hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>

        {/* Carte d — zone dangereuse. */}
        <div className="bg-white rounded-2xl shadow-md border border-rouge/20 p-6 md:p-8 flex flex-col gap-3">
          <h2 className="text-lg font-black text-rouge">Zone dangereuse</h2>
          <p className="text-sm text-muted">
            Supprimer ton compte est définitif. Tu peux exercer ton droit à l&apos;effacement (loi 09-08)
            directement ici.
          </p>
          <SupprimerCompteButton />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
