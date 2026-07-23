# RUNBOOK — Gestes de données curées

*Canal versionné pour les insertions de données curées en base — distinct des
migrations (schéma, CONTRAT-V1 §7) et des runbooks incident
(`RUNBOOK-restauration.md`) ou calendaire (`RUNBOOK-securite.md`). Créé le
23/07/2026 après le constat que les 4 enseignes initiales de la prod
(bim/bringo/carrefour/marjane) avaient été insérées par un geste ad hoc hors
repo (Dashboard Supabase, avant tout garde-fou) — jamais documenté, invisible
de la CI.*

---

## Ajout d'une enseigne curée

**LE canal : le script versionné — jamais le SQL Editor à main levée.**

```bash
DATABASE_URL="<chaîne de connexion>" pnpm --filter @fidwastafid/db ajouter-enseigne <slug> <nom>
```

- **Même convention que `pnpm migrate`** (CONTRAT-V1 §7 : geste humain via le
  runner) : `DATABASE_URL` seule source de connexion, jamais de secret en dur.
  Pour la prod : la chaîne **Session pooler** Supabase, comme les migrations.
- **Validation** par le schéma partagé (`enseigneSchema`, packages/schemas) :
  slug minuscules/chiffres/tirets (1-60), nom 1-100 caractères. Le nom peut
  contenir des espaces sans guillemets (`ajouter-enseigne mr-bricolage Mr Bricolage`).
- **Idempotent** : slug déjà présent → message clair, sortie 0, aucun doublon.
  Un nom différent sur un slug existant n'écrase JAMAIS le nom en base
  (renommer une enseigne = geste curatorial distinct, hors de ce script).
- Le script affiche l'**hôte ciblé** en première ligne — vérifier que c'est
  bien la base voulue avant de lire le reste.

**Vérification après coup** (local ou prod) :

```bash
curl -s https://fidwastafid.com/api/v1/enseignes
```
→ le nouveau slug doit apparaître dans `data[]`.

**Rappel du pourquoi** : CONTRAT-V1 §3 — les enseignes sont une table curée
(slug administré à la main, jamais généré depuis du texte libre soumis).
`insert-deals.mjs` (pipeline) rejette tout deal dont l'enseigne ne correspond
à rien en base — ajouter l'enseigne AVANT le premier run d'un nouveau scraper
(ex. `inwi` avant l'activation du cron inwi), sinon ses deals sont rejetés
(proprement, sans erreur) à chaque run.

---

## Historique des gestes

| Date | Geste | Canal | Base |
|---|---|---|---|
| (avant le 14/07/2026) | Insertion initiale bim/bringo/carrefour/marjane | Ad hoc hors repo (Dashboard Supabase) — antérieur à ce runbook | prod (aswbu) |
| 23/07/2026 | Ajout `inwi` | `ajouter-enseigne` (ce canal) | locale (Docker) — la prod reste À FAIRE, geste Kamel avant activation du cron inwi |
