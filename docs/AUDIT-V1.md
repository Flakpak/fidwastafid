# AUDIT-V1 — base v1 (laqwg)

_Généré le 2026-07-14T19:37:13.187Z par scripts/audit-v1.mjs — lecture seule, aucune écriture effectuée._


## A — Schéma réel


_5 table(s) trouvée(s) dans public : admins, commentaires, deals, users, votes_


### Colonnes — `admins`

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| id | uuid | NO | ∅ |
| created_at | timestamp with time zone | NO | now() |


### Colonnes — `commentaires`

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| id | bigint | NO | ∅ |
| deal_id | bigint | NO | ∅ |
| user_id | uuid | YES | ∅ |
| contenu | text | NO | ∅ |
| created_at | timestamp with time zone | NO | now() |


### Colonnes — `deals`

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| id | bigint | NO | ∅ |
| titre | text | NO | ∅ |
| magasin | text | NO | ∅ |
| ville | text | NO | 'National'::text |
| categorie | text | NO | ∅ |
| prix_promo | numeric | NO | ∅ |
| prix_normal | numeric | NO | ∅ |
| photo_url | text | YES | ∅ |
| description | text | YES | ∅ |
| lien | text | YES | ∅ |
| type | text | NO | 'physique'::text |
| statut | text | NO | 'en_attente'::text |
| score | integer | NO | 0 |
| user_id | uuid | YES | ∅ |
| date_fin | date | YES | ∅ |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| whatsapp_contact | text | YES | ∅ |


### Colonnes — `users`

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| id | uuid | NO | ∅ |
| pseudo | text | NO | ∅ |
| avatar_url | text | YES | ∅ |
| score_reputation | integer | NO | 0 |
| deals_soumis | integer | NO | 0 |
| deals_valides | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |
| genre | text | YES | 'non_precise'::text |
| tranche_age | text | YES | ∅ |
| ville | text | YES | ∅ |
| situation_fam | text | YES | ∅ |
| nb_enfants | text | YES | ∅ |
| profil_complet | boolean | YES | false |


### Colonnes — `votes`

| column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- |
| id | bigint | NO | ∅ |
| deal_id | bigint | NO | ∅ |
| user_id | uuid | YES | ∅ |
| type | text | NO | ∅ |
| created_at | timestamp with time zone | NO | now() |


### Contraintes (PK / FK / UNIQUE)

_(aucune ligne)_


### Index

| tablename | indexname | indexdef |
| --- | --- | --- |
| admins | admins_pkey | CREATE UNIQUE INDEX admins_pkey ON public.admins USING btree (id) |
| commentaires | commentaires_pkey | CREATE UNIQUE INDEX commentaires_pkey ON public.commentaires USING btree (id) |
| commentaires | idx_comments_deal | CREATE INDEX idx_comments_deal ON public.commentaires USING btree (deal_id) |
| deals | deals_pkey | CREATE UNIQUE INDEX deals_pkey ON public.deals USING btree (id) |
| deals | idx_deals_categorie | CREATE INDEX idx_deals_categorie ON public.deals USING btree (categorie) |
| deals | idx_deals_created | CREATE INDEX idx_deals_created ON public.deals USING btree (created_at DESC) |
| deals | idx_deals_score | CREATE INDEX idx_deals_score ON public.deals USING btree (score DESC) |
| deals | idx_deals_statut | CREATE INDEX idx_deals_statut ON public.deals USING btree (statut) |
| deals | idx_deals_ville | CREATE INDEX idx_deals_ville ON public.deals USING btree (ville) |
| users | users_pkey | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id) |
| users | users_pseudo_key | CREATE UNIQUE INDEX users_pseudo_key ON public.users USING btree (pseudo) |
| votes | votes_deal_id_user_id_key | CREATE UNIQUE INDEX votes_deal_id_user_id_key ON public.votes USING btree (deal_id, user_id) |
| votes | votes_pkey | CREATE UNIQUE INDEX votes_pkey ON public.votes USING btree (id) |


## B — Volumétrie

| table | n |
| --- | --- |
| admins | 1 |
| commentaires | 24 |
| deals | 593 |
| users | 0 |
| votes | 15 |


_`public.users` à 0 ligne est un FAIT établi, pas une suspicion : BYPASSRLS est prouvé actif sur cette connexion (admins/deals ci-dessus révèlent des lignes supplémentaires grâce à cet attribut), et un refus de droit produirait une erreur, pas un résultat vide. La v1 provisionne le profil séparément de l'inscription (`profil_complet` default false) ; le formulaire correspondant a été retiré du site._

| table | n |
| --- | --- |
| public.v1_auth_users_audit (vue en lecture seule sur auth.users, id/email/created_at — cf. SUIVI 2026-07-14) | 4 |


## C — Distributions


### deals.statut

| valeur | n |
| --- | --- |
| validé | 580 |
| refusé | 13 |


### deals.categorie

| valeur | n |
| --- | --- |
| Autre | 373 |
| Maison | 179 |
| Électroménager | 17 |
| High-Tech | 15 |
| Alimentaire | 9 |


### deals.ville

| valeur | n |
| --- | --- |
| Casablanca | 561 |
| National | 30 |
| Marrakech | 1 |
| Rabat | 1 |


### deals.type

| valeur | n |
| --- | --- |
| physique | 585 |
| online | 6 |
| les deux | 2 |


### deals.magasin (brut)

| valeur | n |
| --- | --- |
| Carrefour | 565 |
| Marjane | 13 |
| BIM | 8 |
| Jumia | 3 |
| Marjane Market | 2 |
| Avito | 1 |
| AliExpress | 1 |


### deals.magasin normalisé — lower(btrim(magasin))

| valeur | n |
| --- | --- |
| carrefour | 565 |
| marjane | 13 |
| bim | 8 |
| jumia | 3 |
| marjane market | 2 |
| avito | 1 |
| aliexpress | 1 |

| nb_null | nb_vide |
| --- | --- |
| 0 | 0 |


### votes.type

| valeur | n |
| --- | --- |
| chaud | 9 |
| froid | 6 |


## D — Intégrité référentielle

| vérification | n |
| --- | --- |
| votesOrphanDeal | 0 |
| votesOrphanUser | 15 |
| commentairesOrphanDeal | 0 |
| commentairesOrphanUser | 24 |
| dealsUserIdNull | 588 |
| dealsUserIdOrphan | 5 |


_Les vérifications *OrphanUser / dealsUserIdOrphan ci-dessus mesurent l'existence dans `users`, vide par conception (cf. section B) — sans rapport avec la résolution via la vue auth ci-dessous, qui montre les user_id réellement rattachés à un compte._


### Résolution des user_id via public.v1_auth_users_audit


_Le schéma `auth` n'est pas accessible directement (GRANT USAGE impossible pour `postgres` sur Supabase — schéma détenu par `supabase_auth_admin`). Contournement : `public.v1_auth_users_audit` (id, email, created_at), en lecture seule — cf. docs/fidwastafid-plan-v2.md, SUIVI, exception du 2026-07-14._

| vérification | n |
| --- | --- |
| COUNT(*) public.v1_auth_users_audit | 4 |


### user_id résolus dans la vue, par table

| table | colonne | user_id_non_nuls_resolus |
| --- | --- | --- |
| deals | user_id | 5 |
| votes | user_id | 15 |
| commentaires | user_id | 24 |


### user_id distincts référencés (deals ∪ votes ∪ commentaires)

| user_id | nb_deals | nb_votes | nb_commentaires | a_un_email |
| --- | --- | --- | --- | --- |
| 1f0f6f9d-332b-41e2-96e3-dee219edcccc | 5 | 11 | 20 | oui |
| 1ddf23d6-6649-4506-9cd1-d25762465558 | 0 | 3 | 0 | oui |
| 6c038e0c-33ed-496e-872d-e9d2a44488b5 | 0 | 1 | 4 | oui |


## E — Votes (point critique)


### Doublons (deal_id, user_id)

| nb_couples_dupliques | max_doublons |
| --- | --- |
| 0 | 0 |


### 20 pires cas

_(aucune ligne)_


### Score stocké vs recalculé (chaud - froid)

| nb_divergents | divergence_max |
| --- | --- |
| 3 | 1 |


### 10 exemples de divergence

| id | score_stocke | score_recalcule | ecart |
| --- | --- | --- | --- |
| 18 | 0 | -1 | 1 |
| 36 | 0 | 1 | -1 |
| 25 | 0 | 1 | -1 |


## F — Images (deals.photo_url)

| nb_null | nb_vide | nb_data_uri | nb_http | nb_https | nb_autre | longueur_max |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 0 | 0 | 0 | 583 | 0 | 125 |


### TOP 15 domaines (https)

| host | n |
| --- | --- |
| storage.googleapis.com | 559 |
| laqwgehhedvxaqucmeeh.supabase.co | 18 |
| fdn2.gsmarena.com | 2 |
| res.cloudinary.com | 1 |
| images.jumia.ma | 1 |
| ik.imagekit.io | 1 |
| ma.jumia.is | 1 |


## G — Contraintes de forme


### deals.titre

| longueur_max |
| --- |
| 78 |

| tranche | n |
| --- | --- |
| 1-20 | 27 |
| 21-50 | 466 |
| 51-100 | 100 |


### deals.description

| longueur_max |
| --- |
| 172 |

| tranche | n |
| --- | --- |
| NULL | 424 |
| 1-20 | 116 |
| 21-50 | 32 |
| 51-100 | 2 |
| 101-200 | 19 |


### users.pseudo

| longueur_max |
| --- |
| ∅ |

_(aucune ligne)_


### commentaires.contenu

| longueur_max |
| --- |
| 16 |

| tranche | n |
| --- | --- |
| 1-20 | 24 |


### deals.titre sans caractère [a-zA-Z0-9] (slug ASCII vide)

| n |
| --- |
| 0 |

_(aucune ligne)_


### Pseudos en doublon (users.pseudo)

_(aucune ligne)_


### deals.prix_normal NULL ou = 0

| nb_null | nb_zero |
| --- | --- |
| 0 | 6 |


### Incohérences type / ville / lien


_Valeurs réelles trouvées pour deals.type : les deux, online, physique_

| cas | n |
| --- | --- |
| type contient 'ligne' avec ville non nulle | 0 |

| cas | n |
| --- | --- |
| type = 'physique' sans ville | 0 |

| cas | n |
| --- | --- |
| type contient 'ligne' sans lien | 0 |


## H — Temps

| min_created_at | max_created_at |
| --- | --- |
| Thu Mar 19 2026 12:58:25 GMT+0100 (heure normale d’Europe centrale) | Tue Jul 07 2026 13:23:05 GMT+0200 (heure d’été d’Europe centrale) |

| cas | n |
| --- | --- |
| created_at NULL | 0 |

| cas | n |
| --- | --- |
| date_fin dans le passé | 29 |


## I — Colonnes démographiques (users) — liste seule, valeurs hors périmètre (loi 09-08)

| colonne_suspectee_demographique |
| --- |
| genre |
| tranche_age |
| situation_fam |
| nb_enfants |


_Aucune valeur de ces colonnes n'a été lue ni comptée par ce script. Liste établie par correspondance de nom uniquement — à confirmer manuellement avant toute décision d'exclusion ETL._


## ANOMALIES — ce qui bloquera l'insertion en v2

- deals.statut hors enum v2 (auto_draft|en_attente|publie|rejete|expire) : refusé, validé
- deals.type hors enum v2 (physique|en_ligne|les_deux) : les deux, online
- deals : 5 ligne(s) avec user_id introuvable dans users
- votes : 15 ligne(s) avec user_id introuvable dans users
- commentaires : 24 ligne(s) avec user_id introuvable dans users
