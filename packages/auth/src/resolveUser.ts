import { query } from "@fidwastafid/db";
import { authUserSchema, type AuthUser } from "@fidwastafid/schemas";
import { getSupabaseClient } from "./supabaseClient.js";

interface UserRow {
  public_id: string;
  pseudo: string;
  is_admin: boolean;
}

/**
 * `admins` est une table marqueur sans FK nommée : `admins.id` est
 * directement l'uuid de l'utilisateur admin (même valeur que `users.id`),
 * pas une colonne `user_id` séparée.
 */
const USER_LOOKUP_SQL = `
  SELECT u.public_id, u.pseudo, (a.id IS NOT NULL) AS is_admin
  FROM users u
  LEFT JOIN admins a ON a.id = u.id
  WHERE u.id = $1
`;

/**
 * Vérifie le JWT auprès de Supabase Auth puis résout public_id/pseudo/isAdmin
 * depuis notre base — jamais l'inverse (CONTRAT-V1 §5 : rien d'autre ne sort
 * du module, l'uuid interne ne quitte jamais cette fonction).
 */
export async function resolveAuthUser(token: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabaseClient().auth.getUser(token);
  if (error || !data.user) return null;

  const rows = await query<UserRow>(USER_LOOKUP_SQL, [data.user.id]);
  const row = rows[0];
  if (!row) return null;

  return authUserSchema.parse({
    id: data.user.id,
    publicId: row.public_id,
    pseudo: row.pseudo,
    isAdmin: row.is_admin,
  });
}
