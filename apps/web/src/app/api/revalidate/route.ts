import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { query } from "@fidwastafid/db";

/**
 * POST /api/revalidate — VOLONTAIREMENT hors /api/v1 (CONTRAT-V1 §4, la
 * liste d'endpoints du contrat est fermée) : route d'infrastructure au même
 * titre que le pipeline qui écrit directement en base, ou la route proxy
 * /img/deals/[publicId] — jamais consommée par le client web/mobile, jamais
 * soumise aux mêmes garanties de stabilité que le contrat public. Appelée
 * uniquement par le workflow GitHub Actions du cron quotidien (Phase 7B),
 * après la chaîne scraping/insertion, pour que le contenu frais soit
 * immédiatement pris en compte plutôt que d'attendre une expiration de
 * cache naturelle.
 */
export const runtime = "nodejs";

/**
 * Comparaison en temps constant du jeton — jamais un `===` (le temps de
 * comparaison d'une chaîne fuit sa longueur/son préfixe correct par timing).
 * Les deux valeurs sont d'abord hachées en SHA-256 (taille fixe, 32 octets)
 * avant `timingSafeEqual` : celui-ci lève une exception si les deux buffers
 * n'ont pas la même longueur, ce qui arriverait systématiquement pour un
 * jeton fourni de mauvaise longueur — le hachage préalable élimine cette
 * fuite en ramenant toujours la comparaison à deux buffers de même taille.
 */
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.REVALIDATE_TOKEN;
  const provided = request.headers.get("x-revalidate-token");

  // Config manquante côté serveur = jamais un accès permissif par défaut ;
  // un jeton absent côté appelant est rejeté de la même façon (401 dans les
  // deux cas, aucune distinction observable de l'extérieur).
  if (!expected || !provided || !tokensMatch(provided, expected)) {
    return NextResponse.json({ error: "Jeton invalide." }, { status: 401 });
  }

  revalidatePath("/");
  revalidatePath("/sitemap.xml");

  const enseignes = await query<{ slug: string }>("select slug from enseignes");
  for (const { slug } of enseignes) {
    revalidatePath(`/enseigne/${slug}`);
  }

  return NextResponse.json({ ok: true, enseignesRevalidees: enseignes.length });
}
