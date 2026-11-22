import type { Deal } from "@fidwastafid/schemas";
import { GET as getDealsHandler } from "../app/api/v1/deals/route.js";
import { GET as getCompteHandler } from "../app/api/v1/deals/compte/route.js";
import { construireParamsCompte, construireParamsFeed } from "./feedPagination.js";
import type { EtatFiltres } from "./filtresFeed.js";

/**
 * Premier rendu serveur du feed — extrait de app/page.tsx (lot SEO-3b) pour
 * être partagé avec /categorie/[slug], qui affiche le même feed et le même
 * filtre.
 *
 * Appel direct des handlers de route plutôt qu'un fetch HTTP vers soi-même :
 * pas de base URL à deviner (dev/Docker/Vercel ont des origines
 * différentes), et ça reste la même API que le web/mobile consomment
 * (CONTRAT-V1 : une seule porte d'entrée /api/v1).
 */
export interface DealsPage {
  data: Deal[];
  nextCursor: string | null;
}

export async function fetchFeed(filtres: EtatFiltres): Promise<DealsPage> {
  const params = construireParamsFeed(filtres);
  const response = await getDealsHandler(new Request(`http://localhost/api/v1/deals?${params.toString()}`));
  const body = (await response.json()) as DealsPage;
  return { data: body.data, nextCursor: body.nextCursor };
}

export async function fetchTotal(filtres: EtatFiltres): Promise<number | null> {
  const params = construireParamsCompte(filtres);
  const response = await getCompteHandler(new Request(`http://localhost/api/v1/deals/compte?${params.toString()}`));
  if (!response.ok) return null;
  return ((await response.json()) as { total: number }).total;
}

/** Les valeurs répétées (`?ville=A&ville=B`) sont réduites à la première :
 *  l'interface ne peut en produire qu'une, et les filtres restent à choix
 *  unique. */
export function versSearchParams(brut: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    const premiere = Array.isArray(valeur) ? valeur[0] : valeur;
    if (typeof premiere === "string") params.set(cle, premiere);
  }
  return params;
}
