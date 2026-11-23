// ============================================================
// FIDWASTAFID — Un produit, une fiche (lot SEO-2i, CONTRAT-V1 §3,
// vingt-cinquième amendement)
//
// Un produit (empreinte : lien, sinon titre + enseigne — empreinte_curation,
// migration 0014) n'a qu'une fiche, donc une seule URL à vie. Quand il
// revient chez sa source :
// - ligne expirée non rejetée → réactivée (même public_id), en `auto_draft`,
//   puis publication automatique normale ;
// - ligne publiée active à un autre prix → mise à jour si la nouvelle remise
//   respecte les critères de publication automatique, sinon expirée ;
// - rejet admin → bloque le produit seulement si aucune de ses fiches n'a
//   jamais été publiée (lot SEO-2k). Sinon c'est le rejet d'un doublon : le
//   produit met à jour ou réactive sa fiche conservée.
//
// Les soumissions communautaires (`submitter_id`) ne sont jamais modifiées
// ni réactivées : elles relèvent de la modération manuelle.
//
// journal_audit : action `update_deal`, déjà non probante dans
// deals_protection. Une action nouvelle y vaudrait « a été publié » et
// rendrait indexable un brouillon qui ne l'a jamais été.
// ============================================================

import { traiterImage } from "../images.mjs";
import { SOURCE_SQL } from "./publicationAuto.mjs";
import { estPurgeSql } from "./rejetPurge.mjs";
import { UTILISATEUR_SYSTEME_ID } from "./utilisateurSysteme.mjs";

export const VERSION_REGLES_FICHE = "2026-11-23.1";
export const ACTEUR_FICHE = "fiche-produit";
/** Garde-fou du vingt-troisième amendement : part maximale expirée par run. */
export const PART_MAX_EXPIRATIONS = 0.25;

const centimes = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100));

/** Critères de remise de la publication automatique : 20 % à 80 % inclus. */
export function remiseConforme(prix, prixNormal) {
  const promo = centimes(prix);
  const normal = centimes(prixNormal);
  if (promo === null || normal === null || normal <= promo) return false;
  return 5 * promo <= 4 * normal && 5 * promo >= normal;
}

function plusRecente(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/**
 * Ligne à réactiver : celle qui a déjà été publiée, à défaut la plus récente.
 * Jamais une soumission communautaire.
 */
export function choisirLigneReactivable(lignes) {
  const expirees = lignes.filter((l) => l.statut === "expire" && !l.soumis).sort(plusRecente);
  return expirees.find((l) => l.a_ete_publiee) ?? expirees[0] ?? null;
}

/**
 * Portée du rejet admin d'une empreinte (lot SEO-2k) :
 * - `null` : aucun rejet actif autre qu'une Purge (lot SEO-2m) ;
 * - `doublon` : une fiche non rejetée a déjà été publiée, elle porte le produit ;
 * - `retire` : la seule fiche publiée a elle-même été rejetée. Il n'y a pas de
 *   fiche à conserver, et une fiche rejetée n'est jamais réactivée : bloqué ;
 * - `jamais_publie` : aucune fiche publiée : bloqué.
 */
export function porteeRejet(fiches, empreinte) {
  if (!fiches.rejetees.has(empreinte)) return null;
  const lignes = fiches.parEmpreinte.get(empreinte) ?? [];
  if (lignes.some((l) => l.statut !== "rejete" && l.a_ete_publiee)) return "doublon";
  return lignes.some((l) => l.statut === "rejete" && l.a_ete_publiee) ? "retire" : "jamais_publie";
}

/**
 * Décision pour un produit lu dont une ligne scrapée est active.
 * @returns {{ action: "aucune" } | { action: "maj" | "expirer", ligne: object }}
 */
export function deciderLigneActive(lignes, produit) {
  const actives = lignes.filter((l) => (l.statut === "publie" || l.statut === "auto_draft") && !l.soumis);
  if (actives.length === 0) return { action: "aucune" };
  const prix = centimes(produit.prix);
  if (actives.some((l) => centimes(l.prix_promo) === prix)) return { action: "aucune" };
  const triees = [...actives].sort(plusRecente);
  const ligne = triees.find((l) => l.statut === "publie") ?? triees[0];
  if (ligne.statut === "auto_draft" || remiseConforme(produit.prix, produit.prixNormal)) {
    return { action: "maj", ligne };
  }
  return { action: "expirer", ligne };
}

/**
 * Charge, en une requête par nature, les fiches des produits du run.
 * @param {{ paires: { lien: string | null, titre: string }[], enseigneId: string | number }} entree
 * @returns {Promise<{ empreintes: string[], parEmpreinte: Map<string, object[]>, rejetees: Set<string> }>}
 */
export async function chargerFiches(client, { paires, enseigneId }) {
  if (paires.length === 0) return { empreintes: [], parEmpreinte: new Map(), rejetees: new Set() };
  const { rows: calcul } = await client.query(
    `select empreinte_curation(u.l, u.t, $3::bigint) as empreinte
       from unnest($1::text[], $2::text[]) with ordinality as u(l, t, ordre)
      order by u.ordre`,
    [paires.map((p) => p.lien || null), paires.map((p) => p.titre), enseigneId]
  );
  const empreintes = calcul.map((r) => r.empreinte);
  const distinctes = [...new Set(empreintes)];
  const { rows: lignes } = await client.query(
    `select d.id, d.public_id, d.statut, d.prix_promo, d.prix_normal, d.date_fin, d.created_at,
            d.image_key, d.image_source, d.image_purgee_le,
            d.submitter_id is not null as soumis, dp.protege,
            exists (
              select 1 from journal_audit ja
               where ja.cible_type = 'deal' and ja.cible_id = d.public_id
                 and coalesce((ja.details -> 'statut') ->> 'apres', ja.details ->> 'apres') = 'publie'
            ) as a_ete_publiee,
            empreinte_curation(d.lien, d.titre, d.enseigne_id) as empreinte
       from deals d
       join deals_protection dp on dp.public_id = d.public_id
      where d.enseigne_id = $1
        and d.supprime_le is null
        -- Fiche fusionnée (lot SEO-2j) : jamais réactivée ni mise à jour ;
        -- c'est la fiche conservée qui porte le produit.
        and d.fusionne_dans is null
        and empreinte_curation(d.lien, d.titre, d.enseigne_id) = any($2::text[])`,
    [enseigneId, distinctes]
  );
  const parEmpreinte = new Map();
  for (const l of lignes) {
    if (!parEmpreinte.has(l.empreinte)) parEmpreinte.set(l.empreinte, []);
    parEmpreinte.get(l.empreinte).push(l);
  }
  const { rows: memoire } = await client.query(
    `select distinct empreinte from memoire_curation
      where empreinte = any($1::text[]) and decision = 'rejete' and levee_le is null
        and not ${estPurgeSql("motif")}`,
    [distinctes]
  );
  return { empreintes, parEmpreinte, rejetees: new Set(memoire.map((m) => m.empreinte)) };
}

function champsPrix(ligne, produit) {
  const champs = {};
  const comparer = (cle, avant, apres) => {
    const a = avant === null || avant === undefined ? null : String(avant);
    const b = apres === null || apres === undefined ? null : String(apres);
    if (cle === "dateFin" ? a !== b : centimes(avant) !== centimes(apres)) champs[cle] = { avant: a, apres: b };
  };
  comparer("prixPromo", ligne.prix_promo, produit.prix);
  comparer("prixNormal", ligne.prix_normal, produit.prixNormal ?? null);
  const dateAvant = ligne.date_fin instanceof Date ? ligne.date_fin.toISOString().slice(0, 10) : ligne.date_fin;
  comparer("dateFin", dateAvant, produit.dateFin ?? null);
  return champs;
}

/** Écrit la ligne ET sa trace en une seule instruction : l'une ne va pas sans l'autre. */
async function ecrireAvecTrace(client, ligne, produit, statutApres, operation) {
  const metPrix = statutApres !== "expire";
  const { rows } = await client.query(
    `with maj as (
       update deals
          set statut = $2,
              prix_promo = case when $3::boolean then $4::numeric else prix_promo end,
              prix_normal = case when $3::boolean then $5::numeric else prix_normal end,
              date_fin = case when $3::boolean then $6::date else date_fin end,
              vu_le = case when $3::boolean then now() else vu_le end,
              motifs_publication_auto = null,
              updated_at = now()
        where id = $1 and statut = $7 and supprime_le is null
        returning public_id
     )
     insert into journal_audit (admin_id, action, cible_type, cible_id, details)
     select $8::uuid, 'update_deal', 'deal', maj.public_id, $9::jsonb from maj
     returning cible_id`,
    [
      ligne.id,
      statutApres,
      metPrix,
      produit.prix,
      produit.prixNormal ?? null,
      produit.dateFin ?? null,
      ligne.statut,
      UTILISATEUR_SYSTEME_ID,
      JSON.stringify({
        statut: { avant: ligne.statut, apres: statutApres },
        champs: metPrix ? champsPrix(ligne, produit) : {},
        acteur: ACTEUR_FICHE,
        operation,
        versionRegles: VERSION_REGLES_FICHE,
      }),
    ]
  );
  if (rows.length !== 1) throw new Error(`fiche ${ligne.public_id} : ${operation} sans effet (état changé pendant le run ?)`);
  ligne.statut = statutApres;
  if (metPrix) {
    ligne.prix_promo = produit.prix;
    ligne.prix_normal = produit.prixNormal ?? null;
    ligne.date_fin = produit.dateFin ?? null;
  }
}

/**
 * Image d'une fiche existante : conservée si l'URL source n'a pas changé.
 * Une fiche d'avant la colonne `image_source` garde son image et enregistre
 * l'URL. Un téléchargement raté laisse l'image et l'URL en place : il sera
 * retenté au prochain passage.
 */
async function synchroniserImage(client, ligne, photoUrl, imagesActivees) {
  if (!photoUrl) return;
  const imagePresente = Boolean(ligne.image_key) && !ligne.image_purgee_le;
  if (imagePresente && (ligne.image_source === null || ligne.image_source === photoUrl)) {
    if (ligne.image_source === null) {
      await client.query("update deals set image_source = $1 where id = $2", [photoUrl, ligne.id]);
      ligne.image_source = photoUrl;
    }
    return;
  }
  if (imagesActivees) await traiterImage({ photo_url: photoUrl }, ligne.public_id, client);
}

/** Réactive une ligne expirée : même public_id, donc même URL. */
export async function reactiverLigne(client, ligne, produit, imagesActivees) {
  await ecrireAvecTrace(client, ligne, produit, "auto_draft", "reactivation");
  await synchroniserImage(client, ligne, produit.photoUrl, imagesActivees);
}

/**
 * Applique le changement de prix aux lignes actives, sur TOUT ce que le
 * scraper a lu (un produit sorti de promotion n'est plus dans l'archive).
 *
 * Garde-fou : si plus de 25 % des deals publiés actifs de la source
 * devraient expirer, aucune expiration pour cette source sur ce run (panne
 * de lecture probable) ; les mises à jour de prix restent appliquées.
 */
export async function reconcilierActives(client, { produits, empreintes, fiches, source, enseigneId, imagesActivees }) {
  const decisions = [];
  const vues = new Set();
  produits.forEach((produit, i) => {
    const empreinte = empreintes[i];
    if (vues.has(empreinte)) return;
    vues.add(empreinte);
    const rejet = porteeRejet(fiches, empreinte);
    if (rejet !== null && rejet !== "doublon") return;
    const lignes = (fiches.parEmpreinte.get(empreinte) ?? []).filter((l) => l.statut !== "rejete");
    const decision = deciderLigneActive(lignes, produit);
    if (decision.action !== "aucune") decisions.push({ ...decision, produit });
  });

  const aExpirer = decisions.filter((d) => d.action === "expirer");
  let expirationsBloquees = 0;
  if (aExpirer.length > 0) {
    const { rows } = await client.query(
      `select count(*)::int as n
         from deals d
         left join enseignes e on e.id = d.enseigne_id
        where d.enseigne_id = $1 and d.statut = 'publie' and d.supprime_le is null
          and (d.date_fin is null or d.date_fin >= (now() at time zone 'Africa/Casablanca')::date)
          and (${SOURCE_SQL}) = $2`,
      [enseigneId, source]
    );
    const actifs = rows[0].n;
    if (aExpirer.length > actifs * PART_MAX_EXPIRATIONS) {
      expirationsBloquees = aExpirer.length;
      console.log(
        `::warning::${source} — ${aExpirer.length} expiration(s) pour ${actifs} deal(s) actif(s) (> 25 %) : aucune expiration sur ce run, liste à valider.`
      );
      for (const d of aExpirer) console.log(`   - ${d.ligne.public_id} : ${d.ligne.prix_promo} → ${d.produit.prix}`);
    }
  }

  let misAJour = 0;
  let expires = 0;
  for (const d of decisions) {
    if (d.action === "expirer") {
      if (expirationsBloquees > 0) continue;
      await ecrireAvecTrace(client, d.ligne, d.produit, "expire", "prix_hors_criteres");
      expires++;
    } else {
      await ecrireAvecTrace(client, d.ligne, d.produit, d.ligne.statut, "maj_prix");
      await synchroniserImage(client, d.ligne, d.produit.photoUrl, imagesActivees);
      misAJour++;
    }
  }
  return { misAJour, expires, expirationsBloquees };
}
