# apps/pipeline

Pipeline de scraping/extraction de deals (Bringo/Carrefour, catalogues promo
GMS) — rejoint le monorepo en Phase 7A (déménagement, code inchangé, seule
la validation avant insertion utilise désormais les schémas zod partagés de
`packages/schemas`, voir `validation.mjs`). Phase 7B : automatisation cron
quotidien (`.github/workflows/pipeline-quotidien.yml`) + expiration
automatique des deals `auto_draft` trop anciens (`expiration.mjs`).

## Scripts

Toujours lancés depuis la racine du monorepo, via `pnpm --filter pipeline` :

```
pnpm --filter pipeline run discover-site -- <url> <nom-court>
pnpm --filter pipeline run scraper-bringo -- <url-listing-ou-fichier.txt> <ville> [--tous]
pnpm --filter pipeline run extract-catalogue -- <url-ou-chemin> <enseigne>
pnpm --filter pipeline run insert-deals -- <fichier-deals-extraits.json>
pnpm --filter pipeline run rattrapage-descriptions -- [--dry-run]
pnpm --filter pipeline run expirer-auto-draft
pnpm --filter pipeline test
```

Le `--` est nécessaire pour que pnpm transmette les arguments au script plutôt
que de les interpréter lui-même.

- **discover-site** — diagnostic ponctuel : ouvre un navigateur visible
  (Playwright) sur une page cible, capture les appels API et le HTML rendu.
  Aucune variable d'environnement requise.
- **scraper-bringo** — scrape les listings Bringo (pagination automatique),
  ne garde que les produits remisés. Écrit une archive dans
  `extractions/AAAA-MM-JJ_HH-mm_bringo-<ville>.json` (jamais committée,
  voir `.gitignore`). Aucune variable d'environnement requise.
- **extract-catalogue** — extrait les deals d'un catalogue (PDF/image) via
  l'API Claude. Écrit une archive dans `extractions/AAAA-MM-JJ_HH-mm_<enseigne>.json`.
- **insert-deals** — valide (schémas partagés `packages/schemas`) puis insère
  en base les deals d'un fichier d'extraction, statut `auto_draft`. Résout
  l'enseigne texte contre la table `enseignes` réelle (aucune correspondance
  = deal rejeté). Traite l'image du deal si les variables de stockage sont
  présentes ; sinon `image_key` reste `NULL`, jamais bloquant.
- **rattrapage-descriptions** — complète/corrige la description des deals
  Bringo déjà en base dont la fiche produit n'a pas encore été extraite.
- **expirer-auto-draft** — première étape du run quotidien (purge le stock
  mort avant d'ajouter du frais) : tout deal encore `auto_draft` (jamais vu
  par un admin) depuis plus de 14 jours (`expiration.mjs`,
  `SEUIL_JOURS_AUTO_DRAFT`) passe en `expire`. Ne touche jamais un deal
  `publie`/`en_attente`/`rejete`/déjà `expire`.

## Ordre d'exécution typique

1. `expirer-auto-draft` — purge le stock `auto_draft` mort avant d'ajouter du frais.
2. *(optionnel, diagnostic)* `discover-site` — explorer un nouveau site avant
   d'écrire un scraper dédié.
3. `scraper-bringo` **ou** `extract-catalogue` — produit une archive dans
   `extractions/`.
4. `insert-deals <archive produite à l'étape 3>` — valide puis insère en base.
5. *(optionnel, rattrapage ponctuel)* `rattrapage-descriptions`.

## Automatisation — cron quotidien (Phase 7B)

`.github/workflows/pipeline-quotidien.yml` exécute chaque jour à 05:00 UTC
(06:00 Casablanca), + `workflow_dispatch` pour un run manuel de test :
`expirer-auto-draft` → `scraper-bringo` (Casablanca, `bringo-categories.txt`)
→ `insert-deals` → `POST /api/revalidate` (feed, enseignes, sitemap —
`apps/web/src/app/api/revalidate/route.ts`, endpoint hors `/api/v1`,
exception documentée au même titre que ce pipeline, voir CONTRAT-V1 §4).

**Automatisé uniquement le chemin qui peut tourner sans surveillance** :
`extract-catalogue` attend une URL/chemin de catalogue précis à chaque appel
(aucune découverte automatique) — il reste un geste manuel ponctuel, jamais
appelé par ce cron.

Les archives `extractions/` produites par le run sont uploadées en artefact
GitHub Actions (rétention 30 jours) — préserve l'acquis d'archivage sans
rien committer dans le repo.

## Variables d'environnement (noms uniquement — jamais de valeurs ici)

| Variable | Requise par | Rôle |
|---|---|---|
| `DATABASE_URL` | `insert-deals`, `rattrapage-descriptions`, `expirer-auto-draft` | Connexion Postgres (chaîne de connexion). |
| `SUPABASE_URL` | `insert-deals` (traitement image) | Base de l'API Supabase Storage. |
| `SUPABASE_SECRET_KEY` | `insert-deals` (traitement image) | Clé secrète Supabase (`sb_secret_...`), header `apikey`. |
| `ANTHROPIC_API_KEY` | `extract-catalogue` | Appel à l'API Claude pour l'extraction structurée. |
| `CLAUDE_MODEL` | `extract-catalogue` (optionnel) | Surcharge du modèle par défaut. |

`SUPABASE_URL`/`SUPABASE_SECRET_KEY` sont optionnelles pour `insert-deals` :
absentes, le traitement image est simplement sauté pour tout le run
(`image_key` reste `NULL`) — jamais bloquant pour l'insertion des deals.

Le cron quotidien (secrets GitHub) mappe explicitement `SUPABASE_DB_URL` →
`DATABASE_URL` (noms différents par construction, voir le workflow). Il
utilise aussi `REVALIDATE_TOKEN`, consommé par `apps/web` (`POST
/api/revalidate`) — pas par un script de ce package, listé ici pour
mémoire seulement.

## Archives locales (non versionnées)

Le dossier `extractions/` (archives horodatées des extractions passées) et
les artefacts de diagnostic ponctuels (`*-api-log.json`, `*-rendu.html`,
`deals-extraits.json`, `_rattrapage-log.txt`, `_run-prod-log.txt`) sont
exclus par `.gitignore` — ils restent des sorties locales, jamais commitées.
