# RUNBOOK — Revue sécurité mensuelle

*CONTRAT-V1 §9 (sécurité by design, sixième amendement conscient, 22/07/2026) : la
surface de sécurité couvre le code ET la configuration des plateformes (Supabase,
Vercel, Cloudflare, GitHub) — cette checklist existe pour rejouer la vérification côté
plateforme, jamais couverte par le lint/typecheck/tests du code.*

*Séparé de `docs/RUNBOOK-restauration.md` (déclenché par un incident de perte de
données) : celui-ci est une routine calendaire, rejouable à froid, sans incident
préalable.*

---

## FAIT GÉNÉRATEUR

Incident du 22/07/2026 — advisor Supabase `rls_disabled_in_public` : les 9 tables du
schéma `public` étaient exposées sans RLS, grants par défaut complets pour
`anon`/`authenticated`, via l'API Data (PostgREST) — canal que l'app n'a jamais utilisé
(accès exclusif par `DATABASE_URL`, rôle propriétaire, CONTRAT-V1 §7) mais resté ouvert
par défaut. Exposition contenue en 12 min (schéma public retiré de l'API Data, vérifié
par un `curl` renvoyant 404) ; correctif durable migré en prod le jour même
(`0008_rls_public_tables.sql`). La surface auditée jusque-là (code, CI) ne couvrait pas
la configuration de la plateforme managée — cette routine comble ce point mort.

---

## CHECKLIST — à rejouer chaque mois

### 1. Advisors Supabase (Security + Performance)
Dashboard Supabase → projet prod → *Advisors*.

**État nominal attendu** : **9 `INFO` `rls_enabled_no_policy`** (RLS actif sans policy
sur les 9 tables `public` — deny-all voulu pour PostgREST, l'app accède en direct par
le rôle propriétaire) + **1 `WARN` `auth_leaked_password_protection`** (assumé, voir
`IDEES.md`). Toute **nouvelle** entrée au-delà de cet état = anomalie à instruire, pas
un bruit de fond.

### 2. Grants des rôles API
```sql
SELECT grantee, table_name, string_agg(privilege_type, ',')
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
GROUP BY grantee, table_name;
```
Les grants par défaut de PostgREST peuvent rester larges (Supabase les pose à la
création de chaque table) : c'est précisément pourquoi le RLS sans policy de l'item 1
est la barrière réelle, pas les grants eux-mêmes. Objectif ici : constater, pas
corriger — un écart entre ce que cette requête montre et ce que l'advisor rapporte
mérite d'être creusé avant de conclure.

### 3. Canari API Data (rejouable à tout moment, y compris hors revue)
```bash
curl.exe -s -i -H "apikey: <clé publishable courante>" \
  "https://aswbuzvpiskpcaznxhjb.supabase.co/rest/v1/users?select=id&limit=1"
```
**Attendu : JAMAIS un `200` avec des données.** Un `404`/schéma absent de l'API Data,
ou un refus RLS, sont les seules réponses saines. La clé publishable se trouve dans le
dashboard Supabase (Project Settings → API) — jamais commitée, jamais journalisée.

### 4. Réglages Auth Supabase
Dashboard → *Authentication* → *Providers* / *Policies* : providers actifs conformes à
ce qui est réellement utilisé (email/password + éventuels OAuth documentés), aucune
protection désactivée sans décision consciente.

### 5. Secrets GitHub
Repo → *Settings* → *Secrets and variables* → *Actions* : revue des **noms** présents
et de la **date de dernière mise à jour** de chacun — jamais les valeurs (non
visibles, et pas la question posée par cette revue). Un secret orphelin (nom qui ne
correspond plus à rien dans les workflows) ou jamais renouvelé depuis longtemps est à
signaler.

Signal d'alerte spécifique : une date de mise à jour de `SUPABASE_DB_URL` **antérieure**
à la dernière rotation du mot de passe de la base = backup et pipeline quotidien cassés
(voir la section « Rotation du mot de passe de la base » plus bas).

### 6. Vercel
Dashboard Vercel → liste des projets. **Attendu : `fidwastafid-prod` seul** (les
projets `*-v1-legacy` ont été déconnectés/supprimés, cf. SUIVI). Vérifier aussi les
domaines rattachés au projet prod.

### 7. Cloudflare
Dashboard Cloudflare → réglages edge du domaine. **Attendu : neutre vis-à-vis des bots
IA** (pas de blocage actif non décidé), `robots.txt` piloté depuis le repo (`apps/web`)
et non depuis une règle Cloudflare parallèle qui pourrait diverger silencieusement.

### 8. Dependabot
Repo → *Security* → *Dependabot alerts* : aucune alerte ouverte de sévérité haute/
critique sans action ou décision explicite de report.

---

## RLS — rappel pour toute restauration

Les 9 tables `public` ont RLS actif **sans policy** (migration
`0008_rls_public_tables.sql`). Toute restauration de la base (incident, migration VPS)
doit préserver cet état — voir la note dédiée dans
`docs/RUNBOOK-restauration.md` (Étape 4/5).

Même vigilance côté rôles : les attributs de rôle (dont le BYPASSRLS de
`ci_migrations_check`, migration 0009) vivent au niveau **cluster**, pas dans un
`pg_dump` de la base — une restauration vers un cluster neuf (migration VPS) doit
rejouer la création du rôle (0005 + mot de passe posé hors repo) et son BYPASSRLS
(0009), même si `schema_migrations` restaurée les marque déjà « appliquées ».

---

## RLS — règle des 3 consommateurs (incident CI des 22-23/07/2026)

**Fait générateur** : le correctif RLS de l'incident advisor
(`0008_rls_public_tables.sql`, appliqué en prod le 22/07/2026) couvrait bien PostgREST
(canal fermé) et le rôle propriétaire (jamais soumis à RLS sans FORCE), mais a oublié
le **troisième lecteur** de `schema_migrations` : le rôle CI d'audit
`ci_migrations_check` (0005) — non-propriétaire, non-BYPASSRLS. RLS sans policy =
deny-all : sa requête `select id from schema_migrations` réussissait mais retournait
**0 ligne silencieusement** (RLS filtre, ne lève pas d'erreur), le garde-fou
« VÉRIFICATION IMPOSSIBLE » (exit 2) de `checkMigrationsSync.ts` ne se déclenchait
pas, et le job `migrations-check` déclarait les 8 migrations « non appliquées » — CI
rouge sur **toute** branche, quel que soit le commit, docs comprises (runs #191-#204,
diagnostic complet du 23/07/2026).

**Correctif** : `0009_ci_migrations_check_bypassrls.sql` — `alter role
ci_migrations_check bypassrls`. Visibilité RLS uniquement : les privilèges restent
ceux de 0005 (SELECT sur `schema_migrations` seule), les 8 autres tables RLS restent
en `permission denied` pour ce rôle (vérifié en local le 23/07). Pas de policy SELECT
dédiée : une policy rouvrirait un chemin où un resserrement futur re-filtrerait
silencieusement l'audit, et elle casserait l'état advisor nominal de référence
(9 `INFO` `rls_enabled_no_policy`, item 1 de la checklist).

**Règle pour l'avenir (gravée par cet incident)** : avant d'activer RLS sur une
table, **lister qui la lit**. Les 3 consommateurs connus de la base :

1. **app** (`DATABASE_URL`, rôle propriétaire — exempt de RLS tant qu'aucun FORCE) ;
2. **pipeline** (même rôle propriétaire) ;
3. **CI d'audit** (`ci_migrations_check`, BYPASSRLS explicite depuis 0009).

Toute future table RLS se vérifie contre ces trois-là ; tout futur rôle d'audit ou de
lecture contrôlée reçoit **BYPASSRLS explicitement** — un audit qui lit « 0 ligne »
sans erreur est un mensonge silencieux, jamais un état acceptable.

---

## Secrets — mot de passe DB exposé + confusion de variable (incident du 23/07/2026)

**Fait générateur** : lors des manipulations post-0009, une chaîne de connexion
Postgres complète (mot de passe inclus) a été **collée en clair dans un chat
d'agent**. Rotation immédiate du mot de passe DB côté Supabase. Dans la foulée du
recâblage, **confusion entre `SUPABASE_URL` et `DATABASE_URL`** (deux variables au rôle
distinct : la première est l'URL de l'API Supabase, la seconde la chaîne de connexion
Postgres) — la mauvaise valeur posée sur la mauvaise variable a provoqué des **500
(`28P01`, authentification Postgres échouée)** pendant ~15 min, jusqu'au rétablissement
de la bonne paire nom↔valeur.

**Règles gravées** :
- **Jamais** de chaîne de connexion (ni aucun secret) collée dans un chat, un agent, un
  ticket ou un commit — un secret qui a transité par un canal non maîtrisé est
  compromis et doit être tourné, point. Pour partager une config, ne partager que le
  **nom** de la variable, jamais la valeur.
- Avant toute modification d'une variable d'environnement, **vérifier le nom exact**
  (`SUPABASE_URL` ≠ `DATABASE_URL` ≠ `SUPABASE_SECRET_KEY`…) : une valeur correcte sur
  la mauvaise clé casse la prod aussi sûrement qu'une valeur fausse.

---

## Saturation du pool Session Mode — EMAXCONNSESSION (incident du 23/07/2026)

**Fait générateur** : après plusieurs redeploys successifs le 23/07, le pool **Session
Mode** Supabase (port **5432**, plafond **15** connexions) s'est saturé de connexions
**idle**, provoquant des **500 en cascade** (`EMAXCONNSESSION`, `XX000`) sur le site
public et l'admin.

**Cause structurelle** : l'app **serverless** (Vercel) utilisait le **Session pooler**,
conçu pour un petit nombre de connexions **longues**, alors que le profil serverless
crée de **nombreuses instances concurrentes** dont les connexions restent **gelées**
(pas fermées) entre invocations — Vercel gèle l'instance, ses timers JS (dont
`idleTimeoutMillis`, `packages/db/src/client.ts`) ne tournent plus, la connexion reste
ouverte côté pooler. Chaque redeploy fait cohabiter les générations d'instances,
chacune tenant ses connexions idle → le plafond de 15 se remplit par accumulation.
**RÉCIDIVE** d'un incident déjà partiellement traité le 15/07/2026 (`pool max` réduit à
2 par instance) — un pansement sur la taille du pool qui n'adressait pas la cause de
fond (mode de pooling inadapté au serverless).

**Correctif définitif** : `DATABASE_URL` de l'app (Vercel, **Production + Preview**)
basculée du port **5432 (Session pooler)** vers **6543 (Transaction pooler)** — adapté
au profil serverless : la connexion est **rendue au pool à la fin de chaque
transaction**, jamais retenue par une instance gelée. Compatibilité vérifiée sur le
code applicatif avant bascule : `pg` nu (pas de prepared statements **nommés** qui
casseraient en mode transaction), **aucun** `LISTEN`/`NOTIFY`, **aucun** `SET` de
session / `search_path` / advisory lock / temp table, et les **4 usages de
`withTransaction`** (`votes`, `PATCH` et `bulk` admin, `DELETE /me`) restent atomiques
`BEGIN`→`COMMIT` — l'unité de routage native du mode transaction, épinglée sur un seul
backend le temps de la transaction.

**Règle gravée — deux ports, deux usages, ne jamais les confondre** :
- **6543 (Transaction pooler)** : **obligatoire** pour toute app serverless (Vercel,
  futures fonctions). C'est la valeur de `DATABASE_URL` en prod app depuis le
  23/07/2026.
- **5432 (Session pooler)** : réservé aux **scripts manuels one-shot** lancés
  séquentiellement depuis une machine locale ou un runner CI — `migrate`,
  `ajouter-enseigne`, `seed`, `check-migrations-sync`. Connexion unique éphémère,
  fermée en fin de script : le mode session leur convient et ils n'ont pas besoin du
  routage par transaction.
- **Ne jamais remettre 5432 sur la `DATABASE_URL` de l'app** pour une « cohérence »
  apparente avec les scripts : c'est précisément l'erreur qui a causé cet incident.

**Surveillance recommandée** : dans les jours qui suivent ce correctif, constat passif
après **chaque déploiement** — naviguer le site et l'admin manuellement, confirmer
l'absence de nouvelle 500. Le mécanisme étant structurel, un retour d'`EMAXCONNSESSION`
signalerait soit un retour à 5432, soit un nouveau facteur à instruire.

---

## Rotation du mot de passe de la base — liste de contrôle (incident du 27/07/2026)

**Fait générateur** : le mot de passe du rôle `postgres` a été tourné dans la nuit du
26 au 27/07/2026 (vers 00:22 UTC), juste avant l'application de la migration 0010. Deux
détenteurs sur trois ont été mis à jour ; le secret GitHub `SUPABASE_DB_URL` est resté
sur l'ancienne valeur. Le backup quotidien du 27/07 a donc échoué (`password
authentication failed`, 28P01) **sans que personne ne le sache** — découvert le
lendemain matin par un audit manuel, après une journée sans backup vérifié. Le pipeline
quotidien, qui lit le **même** secret, allait échouer dans l'heure.

C'est la **deuxième** rotation à faire des dégâts (la première, le 23/07/2026, est
consignée plus haut : confusion `SUPABASE_URL`/`DATABASE_URL`, ~15 min de 500). Deux
occurrences font une règle : la rotation a besoin d'une liste, pas d'une mémoire.

### Les détenteurs du mot de passe `postgres` — inventaire vérifié le 27/07/2026

| # | Emplacement | Consommateur(s) | Port | Ce que casse un oubli |
|---|---|---|---|---|
| 1 | **Vercel** → `fidwastafid-prod` → *Environment Variables* → `DATABASE_URL`, cibles **Production ET Preview** | l'app web | **6543** (transaction pooler — jamais 5432, voir section EMAXCONNSESSION) | site entier en **500** (`28P01`) — le seul détenteur dont la panne est visible par un visiteur |
| 2 | **GitHub** → secret Actions **`SUPABASE_DB_URL`** | **deux** workflows : `db-backup.yml` (pg_dump) **et** `pipeline-quotidien.yml` (mappé sur `DATABASE_URL`) | 5432 | backup quotidien **et** scraping/expiration quotidiens — deux pannes, pas une |
| 3 | **Local** → `packages/db/.env.migration.local` (jamais commité) | `migrate`, `seed`, `ajouter-enseigne` | 5432 | plus aucune migration ni script de données possible |

**Identifiant distinct, à ne pas confondre** : le secret `CI_MIGRATIONS_CHECK_URL` porte
le mot de passe du rôle **`ci_migrations_check`** (migrations 0005/0009), pas celui de
`postgres`. Tourner l'un ne touche pas l'autre. Un oubli de ce côté rend le job
`migrations-check` rouge sur **toutes** les branches (précédent des 22-23/07, plus haut).

**Non-détenteurs, vérifiés le 27/07/2026** — inutile de les rouvrir à chaque rotation :
`.env` (clés API seulement), `apps/web/.env.local` (Postgres **Docker local**),
`apps/web/.env.storage-prod.local` (clés API Supabase), `docker-compose.yml` et
`ci.yml` (Postgres jetable de CI), aucun secret dependabot, aucune variable de dépôt,
aucun secret d'environnement GitHub.

### Ordre de mise à jour

1. **Tourner** le mot de passe côté Supabase (*Project Settings* → *Database* → *Reset
   database password*). À partir de cet instant, les trois détenteurs sont périmés :
   la fenêtre de casse est ouverte, elle se referme à l'étape 4.
2. **Vercel d'abord** (détenteur 1, Production **et** Preview), **puis redéployer** — une
   variable Vercel ne prend effet qu'au déploiement suivant. C'est la seule panne que le
   public voit : elle se ferme en premier.
3. **Secret GitHub** `SUPABASE_DB_URL` (détenteur 2). Un seul secret, deux workflows.
4. **Fichier local** `packages/db/.env.migration.local` (détenteur 3).
5. **Vérifier chacun par exécution réelle**, jamais par relecture :
   - app : charger le feed et une fiche deal (200, données présentes) ;
   - backup : `gh workflow run db-backup.yml` → conclusion `success` exigée ;
   - pipeline : dispatch manuel, ou attendre le run du lendemain et le regarder ;
   - local : une requête en lecture avec la chaîne locale (`select count(*) from deals`).
6. **Consigner** la rotation dans le SUIVI ci-dessous (date, motif, détenteurs mis à jour).

### Règles gravées par cet incident

- **Une rotation n'est terminée que quand les trois détenteurs sont à jour ET vérifiés
  par une exécution.** Deux sur trois, c'est une panne différée, pas une rotation.
- **Un secret partagé par deux workflows est deux pannes.** `SUPABASE_DB_URL` alimente
  le backup et le pipeline : le compter pour un seul système est l'erreur du 27/07.
- **Un garde-fou muet n'est pas un garde-fou.** GitHub n'envoie d'e-mail d'échec qu'à
  l'auteur du commit déclencheur — un run de cron n'en a pas. `db-backup.yml` ouvre
  désormais une **issue GitHub** en cas d'échec (label `alerte-backup`, une seule issue
  ouverte à la fois, chaque récidive commentée dessus). Le chemin d'alerte lui-même
  s'éprouve à la main : *Run workflow* → `simuler_echec` — un filet non testé n'existe
  pas, comme le test de restauration du backup.
- **Limite connue, non couverte** : GitHub désactive un workflow planifié après 60 jours
  sans activité dans le dépôt. L'alerte couvre « le run a échoué », pas « le run n'a pas
  eu lieu ». À instruire si le dépôt devient dormant (`IDEES.md`).

---

## SUIVI DES REVUES

| Date | Fait par | Résultat | Notes |
|---|---|---|---|
| 22/07/2026 | Première revue (séance du jour) | Nominal | RLS actif sans policy sur les 9 tables `public` (cf. rappel ci-dessus) ; état advisor de référence figé au CONTRAT-V1 §9 le jour même de l'incident qui a motivé cette routine. |
| 27/07/2026 | Claude Code — audit de reprise | **Une anomalie, corrigée** | Rotation du mot de passe DB de la nuit : `SUPABASE_DB_URL` resté sur l'ancienne valeur → backup du jour en échec, silencieux. Secret réécrit, run manuel vérifié (succès, 9 tables et 1051 lignes `deals` restaurées), alerte par issue ajoutée au workflow, liste de contrôle de rotation écrite ci-dessus. Advisors relus : nominal (9 `INFO` + 1 `WARN`). Item 6 (Vercel) : `fidwastafid-prod` seul, domaines conformes. |
