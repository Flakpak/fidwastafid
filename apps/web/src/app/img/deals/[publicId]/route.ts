import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";

/**
 * GET /img/deals/[publicId] — proxy d'images, volontairement hors /api/v1
 * (CONTRAT-V1 §6 : URL publique fidwastafid.com/img/deals/[public_id],
 * backend interchangeable). Exception documentée au même titre que le
 * pipeline (docs/fidwastafid-plan-v2.md, SUIVI) : c'est de l'infra de
 * service d'assets statiques, pas une ressource du domaine métier — /api/v1
 * reste la porte d'entrée unique pour tout le reste (CONTRAT-V1 §4).
 *
 * Aucun id séquentiel exposé (même règle que partout ailleurs) : on ne
 * résout que sur public_id, jamais sur l'id bigint interne.
 */
export const runtime = "nodejs";

const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;

/** Protège la base des rafales de miss sans retarder une image fraîchement ingérée. */
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=300" };

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

/**
 * Nouvelles clés Supabase (sb_secret_...) : header `apikey` uniquement,
 * jamais `Authorization: Bearer` (pas un JWT, doc migration des clés API).
 * Migration terminée (19/07/2026, voir docs/MIGRATION-CLES-SUPABASE.md) :
 * plus de fallback vers l'ancienne `service_role`, désactivée côté
 * Dashboard Supabase.
 */
function storageAuthHeaders(): HeadersInit {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey };
}

/**
 * Seule fonction qui parle au backend de stockage actuel (Supabase Storage).
 * Fetch natif, pas de SDK Supabase, volontairement isolée : LE point à
 * réécrire le jour d'un changement de backend (VPS + stockage nu, R2, etc.
 * — CONTRAT-V1 §6, "backend interchangeable").
 */
async function fetchImageFromStorage(imageKey: string): Promise<Response | null> {
  try {
    const url = `${process.env.SUPABASE_URL}/storage/v1/object/deals-images/${imageKey}`;
    const response = await fetch(url, { headers: storageAuthHeaders() });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
): Promise<NextResponse> {
  const { publicId } = await params;
  if (!PUBLIC_ID_RE.test(publicId)) return notFound();

  // Aucun filtre de statut : un deal expiré garde son image (URL vivante à
  // vie, CONTRAT-V1 §1) et l'admin doit pouvoir prévisualiser les auto_draft.
  const rows = await query<{ image_key: string | null }>("select image_key from deals where public_id = $1", [
    publicId,
  ]);
  const imageKey = rows[0]?.image_key;
  if (!imageKey) return notFound();

  const upstream = await fetchImageFromStorage(imageKey);
  if (!upstream?.body) return notFound();

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000",
    },
  });
}
