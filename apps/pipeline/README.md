# apps/pipeline

Pipeline de scraping/extraction de deals (Bringo/Carrefour, catalogues promo
GMS) — rejoint le monorepo en Phase 7A. Code inchangé par rapport à son
ancien dépôt séparé : ce lot est un déménagement, pas une réécriture. Seul
changement de code : la validation avant insertion utilise désormais les
schémas zod partagés de `packages/schemas` (voir `validation.mjs`).

## Scripts

Toujours lancés depuis la racine du monorepo, via `pnpm --filter pipeline` :

```
pnpm --filter pipeline run discover-site -- <url> <nom-court>
pnpm --filter pipeline run scraper-bringo -- <url-listing-ou-fichier.txt> <ville> [--tous]
pnpm --filter pipeline run extract-catalogue -- <url-ou-chemin> <enseigne>
pnpm --filter pipeline run insert-deals -- <fichier-deals-extraits.json>
pnpm --filter pipeline run rattrapage-descriptions -- [--dry-run]
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

## Ordre d'exécution typique

1. *(optionnel, diagnostic)* `discover-site` — explorer un nouveau site avant
   d'écrire un scraper dédié.
2. `scraper-bringo` **ou** `extract-catalogue` — produit une archive dans
   `extractions/`.
3. `insert-deals <archive produite à l'étape 2>` — valide puis insère en base.
4. *(optionnel, rattrapage ponctuel)* `rattrapage-descriptions`.

## Variables d'environnement (noms uniquement — jamais de valeurs ici)

| Variable | Requise par | Rôle |
|---|---|---|
| `DATABASE_URL` | `insert-deals`, `rattrapage-descriptions` | Connexion Postgres (chaîne de connexion). |
| `SUPABASE_URL` | `insert-deals` (traitement image) | Base de l'API Supabase Storage. |
| `SUPABASE_SECRET_KEY` | `insert-deals` (traitement image) | Clé secrète Supabase (`sb_secret_...`), header `apikey`. |
| `ANTHROPIC_API_KEY` | `extract-catalogue` | Appel à l'API Claude pour l'extraction structurée. |
| `CLAUDE_MODEL` | `extract-catalogue` (optionnel) | Surcharge du modèle par défaut. |

`SUPABASE_URL`/`SUPABASE_SECRET_KEY` sont optionnelles pour `insert-deals` :
absentes, le traitement image est simplement sauté pour tout le run
(`image_key` reste `NULL`) — jamais bloquant pour l'insertion des deals.

## Archives locales (non versionnées)

Le dossier `extractions/` (archives horodatées des extractions passées) et
les artefacts de diagnostic ponctuels (`*-api-log.json`, `*-rendu.html`,
`deals-extraits.json`, `_rattrapage-log.txt`, `_run-prod-log.txt`) sont
exclus par `.gitignore` — ils restent des sorties locales, jamais commitées.
