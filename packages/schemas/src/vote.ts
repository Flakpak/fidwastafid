import { z } from "zod";
import { publicIdSchema } from "./common.js";

/**
 * "chaud" fait monter/chauffer le deal, "froid" le fait retomber/glacer.
 * Valeurs déjà en prod (votes.type) — le renommage type→sens ne touche
 * pas les valeurs, seulement le nom de colonne (CONTRAT-V1 §3).
 */
export const voteSensSchema = z.enum(["chaud", "froid"]);
export type VoteSens = z.infer<typeof voteSensSchema>;

/** POST /api/v1/deals/:publicId/votes — upsert, un seul vote par (deal, user). */
export const voteInputSchema = z.object({
  sens: voteSensSchema,
});
export type VoteInput = z.infer<typeof voteInputSchema>;

/** Nombre maximal de `publicId` acceptés par requête sur `mes-votes` — même
 *  ordre de grandeur que `MAX_LIMIT` de la pagination du feed. */
export const MES_VOTES_MAX_IDS = 50;

/**
 * GET /api/v1/deals/mes-votes — vote courant de l'utilisateur connecté, pour
 * chacun des deals demandés (CONTRAT-V1 §4, seizième amendement conscient).
 * Clé = `publicId`, absent = pas de vote (émis puis retiré, ou jamais émis —
 * les deux cas sont indiscernables, et c'est voulu : la table `votes` ne
 * garde que l'état courant, jamais un historique).
 */
export const mesVotesResponseSchema = z.object({
  votes: z.record(publicIdSchema, voteSensSchema),
});
export type MesVotesResponse = z.infer<typeof mesVotesResponseSchema>;
