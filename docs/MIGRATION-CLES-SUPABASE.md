# Migration des clés API Supabase

*Amorcée le 18/07/2026 — déclenchée par une fuite locale de la `service_role`
legacy (voir historique de session). Sa révocation propre exige de désactiver
les clés legacy côté Dashboard Supabase, ce qui exige d'abord que plus rien
ne les utilise.*

## Convention

Supabase remplace les clés legacy (JWT `anon`/`service_role`) par deux
nouveaux types de clés opaques (pas des JWT) :

| Rôle | Legacy (JWT) | Nouvelle génération |
|---|---|---|
| Publique (navigateur, client) | `anon` — `SUPABASE_ANON_KEY` | `sb_publishable_...` — `SUPABASE_PUBLISHABLE_KEY` |
| Privilégiée (serveur uniquement) | `service_role` — `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` — `SUPABASE_SECRET_KEY` |

**Header de transport — différence clé** : les nouvelles clés ne sont jamais
envoyées en `Authorization: Bearer ...` (ce ne sont pas des JWT, une telle
requête est rejetée). Elles voyagent uniquement dans le header `apikey`, pour
la REST API, le Storage API et l'Admin API Auth. Les clés legacy, elles,
gardent leur pattern historique (`apikey` + `Authorization: Bearer` identiques)
partout où c'est déjà le cas dans ce repo.

Le JWT de **session utilisateur** (`Authorization: Bearer <access_token>`,
ex. `PUT /auth/v1/user` dans `updateUserPassword`) est un objet distinct de
la clé de projet — il continue d'être envoyé en `Authorization` quel que soit
le type de clé de projet utilisé dans `apikey`.

## Fallback transitoire

Chaque point d'usage lit la nouvelle clé en priorité, retombe sur la legacy
si absente (avec un `console.warn` explicite), et n'échoue que si aucune des
deux n'est présente :

- `packages/auth/src/supabaseClient.ts` (`readSupabaseKey`) — vérification
  des JWT entrants (`requireUser`/`requireAdmin`).
- `apps/web/src/lib/supabaseAuthClient.ts` (`readSupabaseKey`) — connexion,
  inscription, réinitialisation de mot de passe (`authActions.ts`).
- `apps/web/src/app/api/v1/_lib/supabaseAdmin.ts` (`adminHeaders`) —
  lecture d'email et suppression de compte (`GET`/`DELETE /api/v1/me`).
- `apps/web/src/app/img/deals/[publicId]/route.ts` (`storageAuthHeaders`) —
  proxy d'images Supabase Storage.
- `apps/web/tests/integration.ts` (`readSupabaseKey`) — obtention d'un JWT
  de test réel via `/auth/v1/token?grant_type=password`.

Les deux jeux de variables coexistent nativement côté Supabase (aucune
bascule big-bang) — `docker-compose.yml` et `.github/workflows/ci.yml`
passent déjà les quatre variables en parallèle.

## Ce qui n'est PAS couvert par ce lot

- **`../fidwastafid-pipeline`** (dossier frère, hors repo) — migration
  prévue dans un second temps, son fallback reste la variable
  `SUPABASE_SERVICE_ROLE_KEY` actuelle jusque-là.
- Le fichier `index.html` / `src/App.jsx` à la racine du repo — reliquat du
  site v1 statique, hors périmètre `apps/web`, non concerné par ce lot.

## Procédure de rotation individuelle (une clé compromise)

1. Dashboard Supabase → Settings → API Keys → onglet clés nouvelle
   génération → créer une clé de remplacement du même rôle (publishable ou
   secret).
2. Remplacer la valeur dans chaque environnement qui la consomme :
   `apps/web/.env.local` (dev), secrets GitHub Actions
   (`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`), variables d'environnement
   du déploiement (Vercel, VPS), et `../fidwastafid-pipeline` une fois
   sa migration faite.
3. Vérifier (`pnpm --filter @fidwastafid/web test:integration`, build Docker)
   que tout fonctionne avec la nouvelle valeur avant de toucher à l'ancienne.
4. Dashboard Supabase → révoquer/supprimer l'ancienne clé compromise.
   **Irréversible** — s'assurer d'abord qu'aucun consommateur ne la référence
   plus (grep `SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY` sur ce repo et
   sur le pipeline).

## Désactivation complète des clés legacy (`anon`/`service_role`)

Ne pas désactiver tant que la checklist suivante n'est pas cochée (reprise
de la documentation Supabase sur la migration) :

- [ ] `../fidwastafid-pipeline` migré vers `SUPABASE_SECRET_KEY`.
- [ ] Secrets GitHub Actions `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`
      renseignés (le job `integration` de la CI fonctionne déjà avec les
      deux jeux de variables, mais vérifier qu'il tourne bien sur les
      nouvelles avant de couper les anciennes).
- [ ] Déploiement de prod (Vercel/VPS) basculé sur les nouvelles variables.
- [ ] Aucune référence restante à `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
      dans ce repo hors code de fallback (`grep -rn` pour confirmer).
- [ ] `index.html`/`src/App.jsx` (reliquat v1, hors périmètre) traité
      séparément si encore utilisé.

Une fois coché : Dashboard Supabase → Settings → API Keys → désactiver
`anon` et `service_role`. Réversible depuis le Dashboard en cas de souci,
mais traiter comme un geste définitif — voir doc Supabase.
