import { query } from "@fidwastafid/db";
import { authUserSchema, generatePublicId, type AuthUser } from "@fidwastafid/schemas";
import { getSupabaseClient } from "./supabaseClient.js";

interface UserRow {
  public_id: string;
  pseudo: string;
  is_admin: boolean;
}

interface SupabaseUserLike {
  id: string;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Provisioning paresseux : un JWT Supabase valide sans ligne `users`
 * correspondante (premier appel après inscription) en crée une à la volée.
 * Pas de nouvel endpoint `/api/v1/auth/register` — CONTRAT-V1 §4 fixe une
 * liste fermée d'endpoints, l'inscription elle-même passe par l'API
 * Supabase Auth directement (déjà l'implémentation actée derrière ce
 * module, CONTRAT-V1 §5), pas par nous.
 *
 * Pseudo : jamais dérivé de l'email (vie privée) — pris dans
 * `user_metadata.pseudo` (fourni au signUp), sinon `membre-XXXXXX`
 * (6 premiers caractères du public_id généré).
 */
async function provisionUser(user: SupabaseUserLike): Promise<UserRow> {
  const publicId = generatePublicId();
  const metaPseudo = user.user_metadata?.pseudo;
  const pseudo = typeof metaPseudo === "string" && metaPseudo.trim() ? metaPseudo.trim() : `membre-${publicId.slice(0, 6)}`;

  const rows = await query<{ public_id: string; pseudo: string }>(
    `insert into users (id, public_id, pseudo) values ($1, $2, $3)
     on conflict (id) do update set id = users.id
     returning public_id, pseudo`,
    [user.id, publicId, pseudo]
  );
  const row = rows[0];
  if (!row) throw new Error("Provisioning utilisateur échoué sans erreur SQL — ne devrait pas arriver.");

  return { public_id: row.public_id, pseudo: row.pseudo, is_admin: false };
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
  const row = rows[0] ?? (await provisionUser(data.user));

  return authUserSchema.parse({
    id: data.user.id,
    publicId: row.public_id,
    pseudo: row.pseudo,
    isAdmin: row.is_admin,
  });
}
