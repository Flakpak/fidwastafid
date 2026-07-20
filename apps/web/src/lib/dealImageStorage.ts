/**
 * Lecture des octets bruts d'une image de deal depuis Supabase Storage —
 * partagée par la route proxy (apps/web/src/app/img/deals/[publicId]/route.ts)
 * et par generateMetadata (apps/web/src/app/deal/[slugAndId]/page.tsx, qui a
 * besoin des dimensions réelles pour og:image:width/height, cf. ogImageJpeg.ts).
 * Un seul point qui parle au backend de stockage actuel (même principe que
 * apps/web/src/app/api/v1/_lib/dealImage.ts côté écriture).
 *
 * Nouvelles clés Supabase (sb_secret_...) : header `apikey` uniquement,
 * jamais `Authorization: Bearer` (docs/MIGRATION-CLES-SUPABASE.md).
 */
export async function fetchDealImageBytes(imageKey: string): Promise<Buffer | null> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");

  try {
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/deals-images/${imageKey}`;
    const response = await fetch(url, { headers: { apikey: secretKey } });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
