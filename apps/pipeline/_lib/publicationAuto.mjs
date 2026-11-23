// ============================================================
// FIDWASTAFID — Publication automatique des deals scrapés (lot SEO-2g,
// CONTRAT-V1 §3, vingt-quatrième amendement)
//
// SOURCE UNIQUE des règles, appelée par publier-auto.mjs (prod) et par la
// suite d'intégration (Postgres réel). Tous les critères sont évalués en SQL,
// dans UNE requête : décision, passage en `publie`, motifs des écartés et
// journal_audit réussissent ou échouent ensemble.
//
// Ne touche que les `auto_draft` non supprimés SANS `submitter_id` : une
// soumission communautaire reste soumise à la modération manuelle.
// ============================================================

import { UTILISATEUR_SYSTEME_ID } from "./utilisateurSysteme.mjs";

/** Consignée dans chaque ligne de journal_audit : à changer avec les règles. */
export const VERSION_REGLES = "2026-11-23.1";
export const ACTEUR = "publication-auto";
export const PLAFOND_PAR_SOURCE = 30;

/**
 * Liste FERMÉE : les sources de pipeline-quotidien.yml, hors bestmark, avec
 * les noms de pipeline_runs. Carrefour porte deux sources sur une même
 * enseigne (bringo.ma et carrefour.ma), séparées par le domaine du lien.
 */
export const SOURCES_CRON = [
  "bringo-casablanca",
  "inwi",
  "universparadiscount",
  "kiabi",
  "carrefour",
  "ab-maroc",
  "aswakassalam",
];

const HOTE = `lower(substring(d.lien from '^https?://([^/]+)'))`;
/** Source d'une ligne `d` (alias `e` = enseignes), noms de pipeline_runs. */
export const SOURCE_SQL = `case
  when e.slug = 'carrefour' and ${HOTE} in ('bringo.ma', 'www.bringo.ma') then 'bringo-casablanca'
  when e.slug = 'carrefour' and ${HOTE} in ('carrefour.ma', 'www.carrefour.ma') then 'carrefour'
  when e.slug = 'carrefour' then 'carrefour-lien-inconnu'
  else coalesce(e.slug, '(sans enseigne)')
end`;

/**
 * Évalue et applique les règles. À appeler dans une transaction : l'appelant
 * valide ou annule.
 *
 * Bornes de remise en produit croisé (promo ≤ 0,80 × normal), sans division :
 * 20 % et 80 % pile restent inclus, sans arrondi. Le plafond retient les plus
 * fortes remises de chaque source ; l'excédent reste en brouillon.
 *
 * Critère ajouté aux règles du lot : un brouillon dont l'empreinte a été
 * rejetée par l'admin (`memoire_curation`) n'est publié que si le produit a
 * déjà une fiche publiée non rejetée (rejet d'un doublon, lot SEO-2k) et
 * qu'aucune autre fiche de ce produit n'est publiée en ce moment.
 *
 * @param {import("pg").Client | import("pg").PoolClient} client
 * @returns {Promise<{ source: string, publicId: string, publie: boolean, motifs: string[] }[]>}
 */
export async function appliquerPublicationAuto(client) {
  const { rows } = await client.query(
    `with base as (
       select d.id, d.public_id, src.source,
              1 - d.prix_promo / nullif(d.prix_normal, 0) as remise,
              array_remove(array[
                case when not (src.source = any($1::text[])) then 'source_hors_cron' end,
                case when d.vu_le < now() - interval '48 hours' then 'non_revu_48h' end,
                case when d.prix_normal is null or d.prix_normal <= d.prix_promo then 'prix_origine_invalide' end,
                case when d.prix_normal > d.prix_promo
                      and (d.prix_promo > 0.80 * d.prix_normal or d.prix_promo < 0.20 * d.prix_normal)
                     then 'remise_hors_bornes' end,
                case when d.categorie = 'Autre' then 'categorie_autre' end,
                case when d.image_key is null or d.image_purgee_le is not null then 'image_absente' end,
                case when char_length(trim(d.titre)) < 10 then 'titre_trop_court' end,
                case when d.date_fin < (now() at time zone 'Africa/Casablanca')::date then 'date_fin_passee' end,
                case when exists (
                  select 1 from memoire_curation m
                   where m.empreinte = empreinte_curation(d.lien, d.titre, d.enseigne_id)
                     and m.decision = 'rejete' and m.levee_le is null
                ) and (
                  not exists (
                    select 1 from deals c
                      join journal_audit ja on ja.cible_type = 'deal' and ja.cible_id = c.public_id
                     where c.enseigne_id is not distinct from d.enseigne_id
                       and c.supprime_le is null and c.fusionne_dans is null and c.statut <> 'rejete'
                       and empreinte_curation(c.lien, c.titre, c.enseigne_id) = empreinte_curation(d.lien, d.titre, d.enseigne_id)
                       and coalesce((ja.details -> 'statut') ->> 'apres', ja.details ->> 'apres') = 'publie'
                  )
                  or exists (
                    select 1 from deals c
                     where c.id <> d.id and c.enseigne_id is not distinct from d.enseigne_id
                       and c.supprime_le is null and c.statut = 'publie'
                       and empreinte_curation(c.lien, c.titre, c.enseigne_id) = empreinte_curation(d.lien, d.titre, d.enseigne_id)
                  )
                ) then 'deja_rejete' end
              ], null)::text[] as motifs
         from deals d
         left join enseignes e on e.id = d.enseigne_id
         cross join lateral (select ${SOURCE_SQL} as source) src
        where d.statut = 'auto_draft'
          and d.supprime_le is null
          and d.submitter_id is null
     ),
     classes as (
       select *, row_number() over (
                   partition by source, cardinality(motifs) = 0
                   order by remise desc nulls last, public_id
                 ) as rang
         from base
     ),
     decides as (
       select id, public_id, source,
              case when cardinality(motifs) = 0 and rang > $2::int
                   then array['plafond_source']::text[]
                   else motifs end as motifs
         from classes
     ),
     publies as (
       update deals d
          set statut = 'publie', updated_at = now(), motifs_publication_auto = null
         from decides x
        where d.id = x.id and cardinality(x.motifs) = 0 and d.statut = 'auto_draft'
        returning d.public_id
     ),
     ecartes as (
       update deals d
          set motifs_publication_auto = x.motifs
         from decides x
        where d.id = x.id and cardinality(x.motifs) > 0
          and d.motifs_publication_auto is distinct from x.motifs
        returning d.id
     ),
     audit as (
       insert into journal_audit (admin_id, action, cible_type, cible_id, details)
       select $3::uuid, 'update_deal', 'deal', p.public_id,
              jsonb_build_object(
                'statut', jsonb_build_object('avant', 'auto_draft', 'apres', 'publie'),
                'champs', '{}'::jsonb,
                'acteur', $4::text,
                'versionRegles', $5::text
              )
         from publies p
       returning cible_id
     )
     select x.source, x.public_id, x.motifs,
            p.public_id is not null as publie,
            a.cible_id is not null as audite
       from decides x
       left join publies p on p.public_id = x.public_id
       left join audit a on a.cible_id = x.public_id
      order by x.source, x.public_id`,
    [SOURCES_CRON, PLAFOND_PAR_SOURCE, UTILISATEUR_SYSTEME_ID, ACTEUR, VERSION_REGLES]
  );

  for (const r of rows) {
    if (r.publie !== r.audite) throw new Error(`publication sans trace d'audit : ${r.public_id}`);
    if (!r.publie && r.motifs.length === 0) throw new Error(`brouillon écarté sans motif : ${r.public_id}`);
  }
  return rows.map((r) => ({ source: r.source, publicId: r.public_id, publie: r.publie, motifs: r.motifs }));
}

/** Résumé par source : nombre publié, nombre écarté, et décompte par motif. */
export function resumerParSource(decisions) {
  const parSource = new Map();
  for (const d of decisions) {
    const ligne = parSource.get(d.source) ?? { source: d.source, publies: 0, ecartes: 0, motifs: {} };
    if (d.publie) {
      ligne.publies++;
    } else {
      ligne.ecartes++;
      for (const m of d.motifs) ligne.motifs[m] = (ligne.motifs[m] ?? 0) + 1;
    }
    parSource.set(d.source, ligne);
  }
  return [...parSource.values()];
}
