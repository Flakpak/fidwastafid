# Migration des clés API Supabase

*Amorcée le 18/07/2026 — déclenchée par une fuite locale de la `service_role`
legacy (voir historique de session). Terminée le 19/07/2026 : clés legacy
désactivées côté Dashboard Supabase, plus aucun fallback ni provisionnement
nulle part (Vercel, CI, fichiers locaux, pipeline) — voir clôture en bas de
page.*

## Convention

Supabase remplace les clés legacy (JWT `anon`/`service_role`) par deux
nouveaux types de clés opaques (pas des JWT) :

| Rôle | Legacy (JWT, désactivée) | Nouvelle génération (en usage) |
|---|---|---|
| Publique (navigateur, client) | `anon` — `SUPABASE_ANON_KEY` | `sb_publishable_...` — `SUPABASE_PUBLISHABLE_KEY` |
| Privilégiée (serveur uniquement) | `service_role` — `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` — `SUPABASE_SECRET_KEY` |

**Header de transport** : les nouvelles clés ne sont jamais envoyées en
`Authorization: Bearer ...` (ce ne sont pas des JWT, une telle requête est
rejetée). Elles voyagent uniquement dans le header `apikey`, pour la REST
API, le Storage API et l'Admin API Auth.

Le JWT de **session utilisateur** (`Authorization: Bearer <access_token>`,
ex. `PUT /auth/v1/user` dans `updateUserPassword`) est un objet distinct de
la clé de projet — il continue d'être envoyé en `Authorization`, sans rapport
avec cette migration.

## Points d'usage (clé requise, plus de fallback)

Chaque point d'usage exige désormais directement la nouvelle clé et échoue
avec un message explicite si elle est absente — plus de repli silencieux
vers une clé legacy :

- `packages/auth/src/supabaseClient.ts` (`readSupabasePublishableKey`) —
  vérification des JWT entrants (`requireUser`/`requireAdmin`).
- `apps/web/src/lib/supabaseAuthClient.ts` (`readSupabasePublishableKey`) —
  connexion, inscription, réinitialisation de mot de passe (`authActions.ts`).
- `apps/web/src/app/api/v1/_lib/supabaseAdmin.ts` (`adminHeaders`) —
  lecture d'email et suppression de compte (`GET`/`DELETE /api/v1/me`).
- `apps/web/src/app/img/deals/[publicId]/route.ts` (`storageAuthHeaders`) —
  proxy d'images Supabase Storage.
- `apps/web/tests/integration.ts` — obtention d'un JWT de test réel via
  `/auth/v1/token?grant_type=password`.
- `../fidwastafid-pipeline/images.mjs` (`storageAuthHeaders`,
  `storageDisponible`) — upload des images collectées par le pipeline.

`docker-compose.yml` et `.github/workflows/ci.yml` (job `integration`) ne
passent plus que `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`.

## Fallback transitoire (archivé, retiré le 19/07/2026)

Entre le 18/07 et le 19/07/2026, chaque point d'usage ci-dessus lisait la
nouvelle clé en priorité et retombait sur la legacy si absente (avec un
`console.warn` explicite), le temps que les secrets nouvelle génération
soient provisionnés partout. Retiré une fois cette étape confirmée :

- Incident CI du 19/07/2026 — `SUPABASE_ANON_KEY` (secret GitHub créé le
  12/07, jamais renouvelé) s'est retrouvée révoquée côté Supabase sans que
  rien ne le signale : le fallback masquait un échec réel derrière un
  succès silencieux, jusqu'à ce que la clé legacy meure et fasse tomber la
  CI 18 runs d'affilée sans message clair. Un fallback vers une clé qui
  peut mourir sans préavis n'est pas un filet de sécurité, juste un échec
  retardé et moins lisible — d'où la suppression plutôt que la reconduite.
- Le code exige maintenant la nouvelle clé directement ; une clé manquante
  est une erreur de configuration explicite (`Error` au démarrage de la
  requête), pas un cas à absorber.

## Procédure de rotation individuelle (une clé compromise)

1. Dashboard Supabase → Settings → API Keys → clés nouvelle génération →
   créer une clé de remplacement du même rôle (publishable ou secret).
2. Remplacer la valeur dans chaque environnement qui la consomme :
   `apps/web/.env.local` (dev), secrets GitHub Actions
   (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`), variables
   d'environnement du déploiement (Vercel, VPS), et
   `../fidwastafid-pipeline` (`.env.run-prod.local`).
3. Vérifier (`pnpm --filter @fidwastafid/web test:integration`, build Docker)
   que tout fonctionne avec la nouvelle valeur avant de toucher à l'ancienne.
4. Dashboard Supabase → révoquer/supprimer l'ancienne clé compromise.
   **Irréversible** — s'assurer d'abord qu'aucun consommateur ne la référence
   plus (`grep -rn "SUPABASE_SECRET_KEY\|SUPABASE_PUBLISHABLE_KEY"` sur ce
   repo et sur le pipeline).

## Clôture — désactivation des clés legacy (`anon`/`service_role`)

- [x] `../fidwastafid-pipeline` migré vers `SUPABASE_SECRET_KEY`
      (19/07/2026, `images.mjs`/`storageDisponible` — plus de fallback).
- [x] Secrets GitHub Actions `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`
      renseignés et confirmés fonctionnels seuls (19/07/2026, run CI
      29686685477 vert sans avertissement de fallback) — job `integration`
      ne référence plus `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
- [x] Déploiement de prod (Vercel) et fichiers locaux basculés sur les
      nouvelles variables, plus aucun provisionnement des legacy nulle part.
- [x] Code de fallback retiré (ce lot, 19/07/2026) — `grep -rn
      "SUPABASE_ANON_KEY\|SUPABASE_SERVICE_ROLE_KEY"` sur ce repo et le
      pipeline ne renvoie plus que des mentions historiques dans les
      commentaires/cette doc, aucune lecture de `process.env` restante.
- [ ] `index.html`/`src/App.jsx` à la racine du repo (reliquat du site v1
      statique, hors périmètre `apps/web`) — non traité, hors scope de
      cette migration ; déjà sur une clé publishable propre (voir le
      fichier), à vérifier séparément si ce reliquat est encore servi.

Clés legacy (`anon`/`service_role`) désactivées côté Dashboard Supabase.
Ce document reste la référence de la convention de clés et de la procédure
de rotation ci-dessus.
