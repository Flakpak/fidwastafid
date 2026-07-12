import { query, withTransaction, closePool } from "./client.js";

/**
 * Données de dev — pas la prod. `SEED_ADMIN_USER_ID` doit être l'uuid réel
 * d'un utilisateur du projet Supabase de dev (créé à part, distinct du v1
 * en prod) : c'est la seule valeur qu'on ne peut pas inventer ici.
 */
function readAdminUserId(): string {
  const id = process.env.SEED_ADMIN_USER_ID;
  if (!id) {
    throw new Error(
      "SEED_ADMIN_USER_ID manquant — uuid Supabase Auth du user de test (projet Supabase de dev)."
    );
  }
  return id;
}

const ADMIN_PUBLIC_ID = process.env.SEED_ADMIN_PUBLIC_ID ?? "kdm2p9qa23";
const ADMIN_PSEUDO = process.env.SEED_ADMIN_PSEUDO ?? "Kamel";

const ENSEIGNES = [
  { slug: "marjane", nom: "Marjane" },
  { slug: "carrefour", nom: "Carrefour" },
  { slug: "bim", nom: "Bim" },
  { slug: "jumia", nom: "Jumia" },
] as const;

interface DealSeed {
  publicId: string;
  titre: string;
  enseigneSlug: (typeof ENSEIGNES)[number]["slug"];
  ville: string | null;
  categorie: string;
  type: "physique" | "en_ligne" | "les_deux";
  prixPromo: number;
  prixNormal: number | null;
  lien: string | null;
  statut: string;
}

const DEALS: DealSeed[] = [
  {
    publicId: "d3m2p9qa23",
    titre: "Huile Lesieur 5L",
    enseigneSlug: "marjane",
    ville: "Casablanca",
    categorie: "Alimentaire",
    type: "physique",
    prixPromo: 89,
    prixNormal: 120,
    lien: null,
    statut: "publie",
  },
  {
    publicId: "d3m2p9qa24",
    titre: "Écouteurs sans fil",
    enseigneSlug: "jumia",
    ville: null,
    categorie: "High-Tech",
    type: "en_ligne",
    prixPromo: 199,
    prixNormal: 299,
    lien: "https://jumia.ma/produit-x",
    statut: "publie",
  },
  {
    publicId: "d3m2p9qa25",
    titre: "Pack couches bébé",
    enseigneSlug: "carrefour",
    ville: "Rabat",
    categorie: "Maison",
    type: "physique",
    prixPromo: 65,
    prixNormal: null,
    lien: null,
    statut: "en_attente",
  },
];

async function main() {
  const adminId = readAdminUserId();

  await withTransaction(async (client) => {
    await client.query(
      `insert into users (id, public_id, pseudo)
       values ($1, $2, $3)
       on conflict (id) do nothing`,
      [adminId, ADMIN_PUBLIC_ID, ADMIN_PSEUDO]
    );

    await client.query(`insert into admins (id) values ($1) on conflict (id) do nothing`, [
      adminId,
    ]);

    for (const e of ENSEIGNES) {
      await client.query(
        `insert into enseignes (slug, nom) values ($1, $2) on conflict (slug) do nothing`,
        [e.slug, e.nom]
      );
    }
  });

  const enseigneRows = await query<{ id: number; slug: string }>(
    "select id, slug from enseignes where slug = any($1)",
    [ENSEIGNES.map((e) => e.slug)]
  );
  const enseigneId = (slug: string): number => {
    const row = enseigneRows.find((r) => r.slug === slug);
    if (!row) throw new Error(`enseigne ${slug} introuvable après seed`);
    return row.id;
  };

  await withTransaction(async (client) => {
    for (const d of DEALS) {
      await client.query(
        `insert into deals
           (public_id, titre, enseigne_id, ville, categorie, type, prix_promo,
            prix_normal, lien, statut, submitter_id, score)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (public_id) do nothing`,
        [
          d.publicId,
          d.titre,
          enseigneId(d.enseigneSlug),
          d.ville,
          d.categorie,
          d.type,
          d.prixPromo,
          d.prixNormal,
          d.lien,
          d.statut,
          adminId,
          0,
        ]
      );
    }
  });

  console.log("Seed terminé.");
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
