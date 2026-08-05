import { query } from "@fidwastafid/db";
import { meSchema, type Me } from "@fidwastafid/schemas";
import type { AuthUser } from "@fidwastafid/auth";
import { fetchAuthUserEmail, SupabaseAdminUnavailableError } from "./supabaseAdmin.js";

interface MeRow {
  pseudo: string;
  couleur_avatar: string;
  deals_count: number;
  votes_count: number;
  commentaires_count: number;
}

interface MeDealRow {
  public_id: string;
  titre: string;
  statut: string;
  motif_rejet: string | null;
  created_at: string;
}

/**
 * Résolution de l'e-mail pour /me, avec dégradation gracieuse — extraite de
 * `buildMe()` pour être testable unitairement (sans base : le harnais
 * `pnpm test` est hors ligne, cf. tests/unit.ts).
 *
 * Trois issues, alignées sur les trois classes du wrapper admin
 * (supabaseAdmin.ts) :
 *   - e-mail obtenu            -> `{ email, emailIndisponible: false }` ;
 *   - amont momentanément HS   -> `{ emailIndisponible: true }`, AUCUNE erreur.
 *                                 Le profil reste rendu sans l'e-mail : un 429
 *                                 Supabase ne doit pas produire un 500 pour un
 *                                 utilisateur légitime (incident du 24/07/2026) ;
 *   - compte auth introuvable  -> on jette. C'est une incohérence réelle entre
 *                                 public.users et auth.users, pas un aléa réseau.
 *
 * Une `SupabaseAdminConfigError` (401/403, clé révoquée — incident du
 * 19/07/2026) n'est PAS rattrapée ici : elle doit rester bruyante.
 */
export async function resolveMeEmail(
  userId: string
): Promise<{ email?: string; emailIndisponible: boolean }> {
  let email: string | null;
  try {
    email = await fetchAuthUserEmail(userId);
  } catch (err) {
    if (err instanceof SupabaseAdminUnavailableError) {
      console.warn(
        `[me] e-mail non résolu (API admin Supabase indisponible) — profil rendu sans e-mail. ${err.message}`
      );
      return { emailIndisponible: true };
    }
    throw err;
  }

  if (email === null) {
    throw new Error(
      "Compte Supabase Auth introuvable (404) pour un utilisateur présent en base — " +
        "incohérence entre public.users et auth.users, ce n'est pas une indisponibilité passagère."
    );
  }

  return { email, emailIndisponible: false };
}

/**
 * Construit la réponse GET /api/v1/me — partagée avec PATCH (relit l'état
 * à jour après écriture plutôt que de reconstruire la réponse à la main).
 * Pseudo lu depuis la base (pas depuis `user.pseudo`, potentiellement
 * périmé juste après un PATCH qui l'aurait changé).
 */
export async function buildMe(user: AuthUser): Promise<Me> {
  const rows = await query<MeRow>(
    `select u.pseudo, u.couleur_avatar,
       (select count(*) from deals d where d.submitter_id = u.id and d.supprime_le is null)::int as deals_count,
       (select count(*) from votes v where v.user_id = u.id)::int as votes_count,
       (select count(*) from commentaires c where c.auteur_id = u.id)::int as commentaires_count
     from users u
     where u.id = $1`,
    [user.id]
  );
  const row = rows[0];
  if (!row) throw new Error("Utilisateur authentifié introuvable en base — ne devrait pas arriver.");

  const { email, emailIndisponible } = await resolveMeEmail(user.id);

  // supprime_le is null (lot 1) : un deal supprimé par la modération ne
  // doit pas réapparaître dans « mes deals », y compris pour son propre
  // soumetteur — invisible partout hors de l'onglet admin dédié.
  const dealRows = await query<MeDealRow>(
    `select public_id, titre, statut, motif_rejet, created_at from deals
     where submitter_id = $1 and supprime_le is null order by created_at desc`,
    [user.id]
  );

  return meSchema.parse({
    publicId: user.publicId,
    pseudo: row.pseudo,
    email,
    emailIndisponible,
    couleurAvatar: row.couleur_avatar,
    dealsCount: row.deals_count,
    votesCount: row.votes_count,
    commentairesCount: row.commentaires_count,
    mesDeals: dealRows.map((d) => ({
      publicId: d.public_id,
      titre: d.titre,
      statut: d.statut,
      motifRejet: d.motif_rejet,
      createdAt: new Date(d.created_at).toISOString(),
    })),
  });
}
