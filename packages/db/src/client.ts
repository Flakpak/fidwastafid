import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Connexion Postgres nue via `pg` — jamais le client Supabase côté serveur.
 * `DATABASE_URL` est la seule source de configuration acceptée : c'est ce qui
 * garde la porte de sortie `pg_dump` ouverte, que la base vive derrière
 * Supabase (transition) ou un Postgres nu sur le VPS cible (CONTRAT-V1 §7).
 */
function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL manquant. packages/db ne se connecte que via cette variable d'environnement."
    );
  }
  return url;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: readDatabaseUrl() });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** BEGIN/COMMIT/ROLLBACK explicite — le client est libéré même si `fn` lève. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
