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
import { Badge, type BadgeVariant } from "../../components/Badge.js";

/** noindex — page de compte, jamais indexable (même famille que /connexion, /admin). */
export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

/** Résolu à chaque requête (état du profil), jamais pré-rendu — même raison que /admin/*. */
export const dynamic = "force-dynamic";

/**
 * Statut -> variante de la primitive `Badge` (CONTRAT-V1 §8) — aucun rendu
 * manuel ici, la primitive porte déjà le contour et les tokens de chaque
 * famille. `rejete` et `auto_draft` partagent `outline` : ni l'un ni
 * l'autre n'est un score chaud (réservé, règle 3) ni un ornement (`safran`,
 * règle 4) — `outline` est le variant neutre déjà prévu pour ce cas, pas
 * une extension. Aucune régression de lisibilité : les deux étaient déjà
 * visuellement identiques avant ce lot (même gris).
 */
const STATUT_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  publie: { label: "Publié", variant: "accent" },
  en_attente: { label: "En attente", variant: "warn" },
  rejete: { label: "Refusé", variant: "outline" },
  expire: { label: "Expiré", variant: "cold" },
  auto_draft: { label: "Brouillon", variant: "outline" },
};

const CARD = "bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(26,24,21,0.05)] p-6 md:p-8";

export default async function ComptePage() {
  const user = await resolveCurrentUser();
  if (!user) redirect("/connexion?next=/compte");

  const me = await buildMe(user);

  return (
    <div className="min-h-screen bg-surface-base text-ink">
      <SiteHeader />
      <main className="max-w-6xl mx-auto p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-black">Mon compte</h1>

        {/* Carte a — identité. */}
        <div className={CARD}>
          <h2 className="text-lg font-black mb-4">Mon identité</h2>
          <IdentiteForm pseudoInitial={me.pseudo} couleurInitiale={me.couleurAvatar} />
        </div>

        {/* Carte b — contributions. Chiffres clés en encre (charte Tadelakt). */}
        <div className={`${CARD} flex flex-col gap-5`}>
          <h2 className="text-lg font-black">Mes contributions</h2>

          <div className="flex items-center gap-8">
            <div>
              <p className="text-3xl font-black text-ink tabular-nums">{me.dealsCount}</p>
              <p className="text-xs font-bold text-ink-muted">deals partagés</p>
            </div>
            <div>
              <p className="text-3xl font-black text-ink tabular-nums">{me.votesCount}</p>
              <p className="text-xs font-bold text-ink-muted">votes</p>
            </div>
            <div>
              <p className="text-3xl font-black text-ink tabular-nums">{me.commentairesCount}</p>
              <p className="text-xs font-bold text-ink-muted">commentaires</p>
            </div>
          </div>

          {me.mesDeals.length > 0 && (
            <ul className="flex flex-col gap-2">
              {me.mesDeals.map((d) => {
                const badge = STATUT_BADGE[d.statut] ?? { label: d.statut, variant: "outline" as const };
                const titre =
                  d.statut === "publie" ? (
                    <Link href={`/deal/${dealUrlSlug(d.titre, d.publicId)}`} className="font-semibold hover:text-accent">
                      {d.titre}
                    </Link>
                  ) : (
                    <span className="font-semibold">{d.titre}</span>
                  );
                return (
                  <li
                    key={d.publicId}
                    className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
                  >
                    <div className="min-w-0">
                      {titre}
                      <p className="text-xs text-ink-subtle">{relativeDate(d.createdAt)}</p>
                      {d.statut === "rejete" && d.motifRejet && (
                        <p className="text-xs text-warn font-semibold mt-0.5">Rejeté : {d.motifRejet}</p>
                      )}
                    </div>
                    <Badge variant={badge.variant} className="shrink-0">
                      {badge.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Carte c — données. */}
        <div className={`${CARD} flex flex-col gap-3`}>
          <h2 className="text-lg font-black">Mes données</h2>
          <div>
            <p className="text-xs font-bold text-ink-muted mb-1">Email</p>
            {/* Dégradation gracieuse (incident du 24/07/2026, docs/INCIDENTS.md) :
                l'e-mail vit dans Supabase Auth, pas en base. Si l'API admin est
                momentanément indisponible, le reste du profil est parfaitement
                utilisable — on affiche l'indisponibilité plutôt que de casser
                toute la page. Tokens Tadelakt : les tokens légués ont été purgés au lot 2b. */}
            {me.email ? (
              <p className="text-sm text-ink-muted bg-surface-subtle rounded-lg px-3 py-2">{me.email}</p>
            ) : (
              <p className="text-sm text-ink-muted bg-surface-subtle rounded-lg px-3 py-2 italic">
                Momentanément indisponible — réessaie dans quelques instants.
              </p>
            )}
            <p className="text-xs text-ink-subtle mt-1">Identifiant de connexion — non modifiable ici.</p>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Fidwastafid conserve ton email, ton pseudo, ta couleur d&apos;avatar et l&apos;historique de tes
            contributions (deals, votes, commentaires) pour faire fonctionner ton compte et afficher tes
            contributions à la communauté. Détails complets :{" "}
            <Link href="/confidentialite" className="text-accent font-bold hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>

        {/* Carte d — zone dangereuse : registre danger (braise en contour, jamais en aplat). */}
        <div className={`bg-surface rounded-2xl border border-hot/25 shadow-[0_1px_2px_rgba(26,24,21,0.05)] p-6 md:p-8 flex flex-col gap-3`}>
          <h2 className="text-lg font-black text-hot">Zone dangereuse</h2>
          <p className="text-sm text-ink-muted">
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
