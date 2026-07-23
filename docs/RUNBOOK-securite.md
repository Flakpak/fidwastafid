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

## SUIVI DES REVUES

| Date | Fait par | Résultat | Notes |
|---|---|---|---|
| 22/07/2026 | Première revue (séance du jour) | Nominal | RLS actif sans policy sur les 9 tables `public` (cf. rappel ci-dessus) ; état advisor de référence figé au CONTRAT-V1 §9 le jour même de l'incident qui a motivé cette routine. |
