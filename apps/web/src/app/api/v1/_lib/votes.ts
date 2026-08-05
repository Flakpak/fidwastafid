import { query } from "@fidwastafid/db";
import type { VoteSens } from "@fidwastafid/schemas";

/**
 * Vote courant de `userId` pour chacun des `publicIds` demandés — clé =
 * `publicId`, absent = pas de vote (CONTRAT-V1 §4, seizième amendement
 * conscient). Source UNIQUE partagée par la fiche deal (appel direct, SSR)
 * et `GET /api/v1/deals/mes-votes` (le feed) : le même chemin de lecture,
 * jamais deux requêtes écrites à côté.
 *
 * `votes` ne garde que l'état COURANT (pas un historique) : un vote retiré
 * (`DELETE .../votes`) n'a simplement plus de ligne — cette fonction reflète
 * donc correctement un vote émis puis retiré sans cas particulier.
 */
export async function fetchMesVotes(userId: string, publicIds: string[]): Promise<Record<string, VoteSens>> {
  if (publicIds.length === 0) return {};
  const rows = await query<{ public_id: string; sens: VoteSens }>(
    `select d.public_id, v.sens
       from votes v
       join deals d on d.id = v.deal_id
      where v.user_id = $1 and d.public_id = any($2::text[])`,
    [userId, publicIds]
  );
  return Object.fromEntries(rows.map((r) => [r.public_id, r.sens]));
}
