import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { enseigneSchema } from "@fidwastafid/schemas";

/** GET /api/v1/enseignes — public, sans auth (CONTRAT-V1 §4). */
export async function GET(): Promise<NextResponse> {
  const rows = await query<{ slug: string; nom: string }>("select slug, nom from enseignes order by nom");
  const data = rows.map((row) => enseigneSchema.parse(row));
  return NextResponse.json({ data });
}
