import { query } from "@fidwastafid/db";
import { meSchema, type Me } from "@fidwastafid/schemas";
import type { AuthUser } from "@fidwastafid/auth";
import { fetchAuthUserEmail } from "./supabaseAdmin.js";

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
 * Construit la réponse GET /api/v1/me — partagée avec PATCH (relit l'état
 * à jour après écriture plutôt que de reconstruire la réponse à la main).
 * Pseudo lu depuis la base (pas depuis `user.pseudo`, potentiellement
 * périmé juste après un PATCH qui l'aurait changé).
 */
export async function buildMe(user: AuthUser): Promise<Me> {
  const rows = await query<MeRow>(
    `select u.pseudo, u.couleur_avatar,
       (select count(*) from deals d where d.submitter_id = u.id)::int as deals_count,
       (select count(*) from votes v where v.user_id = u.id)::int as votes_count,
       (select count(*) from commentaires c where c.auteur_id = u.id)::int as commentaires_count
     from users u
     where u.id = $1`,
    [user.id]
  );
  const row = rows[0];
  if (!row) throw new Error("Utilisateur authentifié introuvable en base — ne devrait pas arriver.");

  const email = await fetchAuthUserEmail(user.id);
  if (!email) throw new Error("Email introuvable via l'API admin Supabase.");

  const dealRows = await query<MeDealRow>(
    `select public_id, titre, statut, motif_rejet, created_at from deals where submitter_id = $1 order by created_at desc`,
    [user.id]
  );

  return meSchema.parse({
    publicId: user.publicId,
    pseudo: row.pseudo,
    email,
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
