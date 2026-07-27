import type { Commentaire } from "@fidwastafid/schemas";

/**
 * « Aucun commentaire » et « chargement impossible » sont deux faits
 * différents — d'où ce résultat discriminé plutôt qu'un `Commentaire[]`. Le
 * `return []` d'avant transformait une panne d'API en affirmation fausse :
 * « Commentaires (0) » sur un deal qui en avait. Même motif que les quatre
 * classes de `_lib/turnstile.ts`, à une échelle plus petite.
 *
 * Isolé de page.tsx pour rester testable hors ligne : la page, elle, appelle
 * le handler de route (qui exige une base).
 */
export type ResultatCommentaires = { ok: true; commentaires: Commentaire[] } | { ok: false };

export async function lireCommentaires(
  publicId: string,
  appeler: () => Promise<Response>
): Promise<ResultatCommentaires> {
  try {
    const response = await appeler();
    if (!response.ok) {
      console.error(`[deal] commentaires illisibles — publicId=${publicId} statut=${response.status}`);
      return { ok: false };
    }
    const body = (await response.json()) as { data: Commentaire[] };
    // Un corps 200 sans `data` exploitable est un échec de lecture, pas une
    // discussion vide : on ne le déguise pas en liste vide.
    if (!Array.isArray(body?.data)) {
      console.error(`[deal] commentaires illisibles — publicId=${publicId} corps 200 sans tableau data`);
      return { ok: false };
    }
    return { ok: true, commentaires: body.data };
  } catch (err) {
    // Le handler lève au lieu de répondre (base injoignable, JSON illisible) :
    // même conclusion qu'un statut d'erreur, et la page reste servie — le deal
    // lui-même, lui, a bien été chargé.
    console.error(
      `[deal] commentaires illisibles — publicId=${publicId} ${err instanceof Error ? err.message : String(err)}`
    );
    return { ok: false };
  }
}
