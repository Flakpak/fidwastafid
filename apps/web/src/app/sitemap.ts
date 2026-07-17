import type { MetadataRoute } from "next";
import { query } from "@fidwastafid/db";
import { dealUrlSlug } from "@fidwastafid/schemas";
import { SITE_URL } from "../lib/siteUrl.js";

/**
 * Généré depuis la base à chaque requête (pas de cache statique au build —
 * mêmes raisons que le feed/page deal, voir app/page.tsx). Seuls les
 * statuts publics (CONTRAT-V1 §1 : `publie` + `expire`, jamais
 * `en_attente`/`rejete`/`auto_draft`) sont exposés — un deal expiré reste
 * un actif SEO, il doit rester dans le sitemap.
 */
export const dynamic = "force-dynamic";

interface DealRow {
  public_id: string;
  titre: string;
  updated_at: string;
}

interface EnseigneRow {
  slug: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [deals, enseignes] = await Promise.all([
    query<DealRow>(
      "select public_id, titre, updated_at from deals where statut = any($1) order by updated_at desc",
      [["publie", "expire"]]
    ),
    query<EnseigneRow>("select slug from enseignes"),
  ]);

  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: new URL("/concept", SITE_URL).toString(), changeFrequency: "monthly", priority: 0.3 },
    ...deals.map((d) => ({
      url: new URL(`/deal/${dealUrlSlug(d.titre, d.public_id)}`, SITE_URL).toString(),
      lastModified: new Date(d.updated_at),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...enseignes.map((e) => ({
      url: new URL(`/enseigne/${e.slug}`, SITE_URL).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
