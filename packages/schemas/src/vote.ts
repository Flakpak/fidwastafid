import { z } from "zod";

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
