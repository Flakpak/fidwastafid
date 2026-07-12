import { query, type PoolClient } from "@fidwastafid/db";

interface AuditEntry {
  adminId: string;
  action: string;
  cibleType: string;
  cibleId?: string | null;
  details?: unknown;
}

/**
 * journal_audit — un log par action admin (plan v2, Phase 3). Passer `client`
 * pour écrire dans la même transaction que l'action elle-même (recommandé :
 * on ne veut pas d'action admin sans sa trace, ni l'inverse).
 */
export async function logAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const sql = `insert into journal_audit (admin_id, action, cible_type, cible_id, details) values ($1,$2,$3,$4,$5)`;
  const params = [
    entry.adminId,
    entry.action,
    entry.cibleType,
    entry.cibleId ?? null,
    entry.details === undefined ? null : JSON.stringify(entry.details),
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
