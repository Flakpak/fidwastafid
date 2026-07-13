# FIDWASTAFID — PLAN D'ACTIONS V2
*Document de référence — à coller en début de session. Mettre à jour la section SUIVI à chaque avancement.*

---

## LA CIBLE

**Architecture** : API-first. Une seule porte d'entrée (`/api/v1`), consommée par le web (Next.js SSR), la future app mobile, et les canaux de distribution (WhatsApp/Telegram).

**Hébergement cible** : VPS OVH unique (~10-15 €/mois) derrière Cloudflare gratuit — app conteneurisée + PostgreSQL + fichiers images, géré via Coolify.

**Hébergement de transition** (pendant la construction) : Vercel + Supabase. Bascule vers la cible quand la facture managée dépasse durablement ~40-50 €/mois OU besoin de souveraineté concrétisé.

**Stack** : monorepo pnpm · Next.js 15 (App Router) · TypeScript · Tailwind (charte rouge/or/crème, Scheherazade New) · zod · Docker · GitHub Actions (CI + cron) · Postgres (Supabase puis VPS).

---

## PRINCIPES NON NÉGOCIABLES

Toute décision en cours de route se vérifie contre cette liste. Si elle en viole un, on ne la prend pas.

1. **Les 4 portes de sortie restent ouvertes et testées** :
   - la base sort par `pg_dump` (jamais de fonctionnalité Supabase-only côté serveur) ;
   - l'app sort par Docker (`docker compose up` doit fonctionner en local à tout moment) ;
   - l'auth sort par l'adaptateur `packages/auth` (aucun code métier ne touche Supabase Auth directement) ;
   - les images sortent par le CDN (jamais d'URL Supabase Storage en direct dans le HTML).
2. **Aucun produit propriétaire d'hébergeur** : pas de Vercel KV/Postgres/Blob, pas d'Edge Functions Supabase pour la logique métier.
3. **Toutes les écritures passent par l'API** (`/api/v1`) : validation zod, rate limiting, audit. La clé service Supabase ne vit que côté serveur.
4. **La machine collecte, l'humain publie** : le flux `auto_draft` → validation admin est conservé tel quel.
5. **Jamais de prix deviné** : le rejet prime sur l'invention (principe existant du pipeline, étendu à toute la plateforme).
6. **Périmètre fermé par phase** : aucune feature ajoutée en cours de phase. Les idées vont dans un fichier `IDEES.md`, elles seront triées après la mise en prod de la v2.
7. **Sécurité by design** : validation d'entrée systématique, moindre privilège, en-têtes de sécurité dès le squelette, audit log des actions admin, secrets uniquement en variables d'environnement, Dependabot actif.

---

## DÉCISIONS IRRÉVERSIBLES — À FIGER EN PHASE 1, AVANT TOUT CODE

Ce sont les choix coûteux à changer après coup. C'est ici que « ne pas revenir en arrière » se joue.

| Décision | Pourquoi c'est irréversible | À figer |
|---|---|---|
| **Format des slugs de deals** | Les URLs indexées par Google et partagées sur WhatsApp ne doivent JAMAIS changer | `/deal/[slug]` avec slug stable (ex : `huile-lesieur-5l-marjane-89dh` + suffixe id court pour l'unicité) |
| **Arborescence d'URLs** | Idem — le SEO se construit dessus pendant des années | `/` (feed) · `/deal/[slug]` · `/enseigne/[nom]` · `/ville/[nom]` (réservé) · `/api/v1/*` |
| **Modèle de domaine (schémas zod)** | Partagé par l'API, le web, le mobile futur et le pipeline — le changer casse tout en cascade | Entités : Deal, Vote, Commentaire, Soumission, User, Enseigne + statuts (`auto_draft`, `en_attente`, `publie`, `rejete`, `expire`) |
| **Contrat API v1** | La future app mobile et d'éventuels partenaires B2B consommeront ce contrat | Liste fermée des endpoints + conventions (pagination, erreurs, versionnage) |
| **Interface du module auth** | Tout le code s'écrit contre elle | `getCurrentUser()`, `requireUser()`, `requireAdmin()` — rien d'autre ne sort du module |
| **Schéma d'URL des images** | Les URLs d'images vivent dans le HTML indexé et les partages | `fidwastafid.com/img/deals/[id]` (proxifié + caché par Cloudflare, backend interchangeable) |
| **Conventions base de données** | Migrations = seul canal de modification du schéma | Nommage tables/colonnes en français (continuité existant), migrations SQL versionnées dans le repo, plus jamais de SQL manuel en prod |

---

## LES PHASES

### PHASE 0 — Protéger l'existant *(1 session courte — À FAIRE EN PREMIER, indépendant de tout le reste)*
- [ ] Backup quotidien de la base : workflow GitHub Actions `pg_dump` via `DATABASE_URL`, stocké hors Supabase, avec **test de restauration** (un backup non testé n'existe pas).
- [ ] Cloudflare gratuit devant fidwastafid.com (DNS OVH → Cloudflare) : TLS, anti-DDoS, cache.
- [ ] `git tag v1-legacy` sur l'état actuel du repo.
- [ ] Google Search Console : propriété vérifiée (via DNS), pour commencer à accumuler des données de recherche dès maintenant.

**Terminé quand** : un backup a été restauré avec succès sur une base de test + le site passe par Cloudflare + Search Console reçoit des données.

### PHASE 1 — Conception sur papier *(1-2 sessions — zéro code)*
- [ ] Figer les 7 décisions irréversibles du tableau ci-dessus, une par une.
- [ ] Contrat API v1 : liste des endpoints (deals, votes, commentaires, soumissions, admin, auth), formats de réponse, codes d'erreur, pagination.
- [ ] Schémas zod du domaine, écrits et relus (ils serviront de spécification exécutable).
- [ ] Stratégie de redirections 301 : inventaire des URLs actuelles → mapping vers les nouvelles.
- [ ] Design tokens de la charte (couleurs, typo, espacements) prêts pour Tailwind.

**Terminé quand** : un document `CONTRAT-V1.md` existe dans le repo et fait foi. Tout le code des phases suivantes s'écrit contre lui.
| 1 — Conception | ✅ fait | Les 7 décisions gravées dans CONTRAT-V1.md |

PROCHAINE TÂCHE : Phase 2 — Fondation (monorepo pnpm, schémas zod, migrations SQL).

### PHASE 2 — Fondation technique *(2-3 sessions)*
- [ ] Monorepo pnpm : `apps/web`, `packages/schemas`, `packages/db`, `packages/auth`.
- [ ] Next.js 15 + TypeScript strict + Tailwind avec la charte.
- [ ] `packages/schemas` : les zod de la Phase 1, implémentés.
- [ ] `packages/db` : adaptateur Postgres (connexion par `DATABASE_URL` uniquement).
- [ ] `packages/auth` : interface figée + implémentation Supabase Auth derrière.
- [ ] Docker + docker-compose fonctionnels (app + Postgres local) — testés.
- [ ] CI GitHub Actions : lint + typecheck + tests + build Docker sur chaque push. Rien ne merge si ça casse.
- [ ] En-têtes de sécurité (CSP, HSTS, X-Frame-Options) + Dependabot.

**Terminé quand** : `docker compose up` sert une page d'accueil vide mais stylée charte, la CI est verte, et le squelette est déployé sur Vercel (branche v2, URL de préversion).

### PHASE 3 — L'API d'abord *(3-4 sessions)*
- [ ] `/api/v1` complet selon le contrat : deals (lecture publique), votes, commentaires, soumissions, endpoints admin (validation pipeline, bulk actions).
- [ ] Rate limiting par IP et par utilisateur sur toutes les écritures.
- [ ] Cloudflare Turnstile sur la soumission publique.
- [ ] Audit log des actions admin (qui, quoi, quand) en table dédiée.
- [ ] Spec OpenAPI générée depuis les schémas zod.
- [ ] Tests d'intégration des endpoints critiques (soumission, validation, vote).

**Terminé quand** : toute l'API est testable au `curl`, les tests passent en CI, la spec OpenAPI est publiée. **Aucune interface encore — c'est normal.**

### PHASE 4 — Le web comme premier client *(4-5 sessions)*
- [ ] Feed en SSR (rendu serveur, HTML complet pour Google).
- [ ] Page deal `/deal/[slug]` — la pièce maîtresse SEO.
- [ ] Pages enseignes `/enseigne/marjane`, `/enseigne/bim`, `/enseigne/carrefour`.
- [ ] Auth (connexion, inscription), votes, commentaires, soumission — via l'API.
- [ ] Admin avec onglet Pipeline (`auto_draft` en premier, bulk select/validate/reject, tri par remise décroissante — parité avec l'existant).
- [ ] Redesign intégré ici (Claude Design : feed + page deal, mobile-first, charte).
- [ ] Images servies via `/img/deals/[id]` cachées par Cloudflare.

**Terminé quand** : parité fonctionnelle complète avec le site actuel, validée en préversion sur mobile. **Pas une feature de plus.**

### PHASE 5 — SEO industrialisé *(2 sessions)*
- [ ] Metadata par page (title, description) + Open Graph (partages WhatsApp avec image et prix).
- [ ] Données structurées schema.org `Offer`/`Product` sur chaque deal.
- [ ] `sitemap.xml` dynamique généré depuis la base.
- [ ] Redirections 301 depuis les anciennes URLs (mapping de la Phase 1).
- [ ] Search Console : soumission du sitemap, vérification de l'indexation.

**Terminé quand** : le test de résultats enrichis Google valide les données structurées + le sitemap est soumis et exploré.

### PHASE 6 — Bascule en production *(1 session + surveillance)*
- [ ] Gel du contenu v1, dernière synchro.
- [ ] Bascule DNS du domaine vers la v2.
- [ ] Passage Vercel Pro (conformité usage commercial).
- [ ] Surveillance 72h : erreurs, indexation, remontées utilisateurs.
- [ ] Suppression du code v1 du repo (le tag `v1-legacy` reste l'archive).

**Terminé quand** : la v2 sert 100 % du trafic depuis 1 semaine sans régression.

### PHASE 7 — Pipeline & automatisation *(2 sessions)*
- [ ] Pipeline `.mjs` rejoint le monorepo (`apps/pipeline`) — code inchangé, il utilise désormais les schémas zod partagés pour valider avant insertion.
- [ ] Cron GitHub Actions quotidien : scraping Bringo + insertion + déclenchement de la revalidation des pages Next.js (contenu frais indexé automatiquement).
- [ ] Archivage des extractions conservé (dossiers horodatés — acquis à préserver).

**Terminé quand** : un deal scrapé le matin est visible sur le site sans intervention manuelle autre que la validation admin.

### PHASE 8 — Mobile & opérations *(2-3 sessions)*
- [ ] PWA : manifest, service worker, installable (Android prioritaire — marché principal).
- [ ] Notifications push web pour les deals flash.
- [ ] Sentry (erreurs front + API).
- [ ] Runbook : procédures écrites (déploiement, restauration backup, incident).
- [ ] Décision app native Expo : notée, non exécutée — l'API la rend peu coûteuse le jour venu.

**Terminé quand** : le site s'installe sur un Android, une push de test arrive, Sentry capte une erreur de test, le runbook est relu.

### PHASE 9 — Bascule VPS *(déclenchée par condition, pas par date)*
**Déclencheurs** : facture managée > ~40-50 €/mois durable, OU besoin de souveraineté (argument B2B), OU envie/temps d'assumer l'ops.
- [ ] VPS OVH provisionné + durci (SSH clés, pare-feu, mises à jour auto).
- [ ] Coolify installé : déploiement Git, TLS auto.
- [ ] Répétition générale de la migration sur un sous-domaine de test : restauration `pg_dump`, montage des images, app conteneurisée, auth basculée sur l'implémentation auto-hébergée via l'adaptateur.
- [ ] Bascule DNS réelle un week-end calme. Supabase/Vercel résiliés après 2 semaines de stabilité.

**Terminé quand** : tout tourne sur le VPS, les backups partent vers un stockage externe, et le runbook est à jour.

---

## CE QU'ON NE FAIT PAS (discipline de périmètre)

- Pas de nouvelles features avant la Phase 6 (elles vont dans `IDEES.md`).
- Pas d'app native avant que la PWA ait montré ses limites.
- Pas de microservices, pas de Kubernetes, pas d'AWS/Azure — surdimensionnés pour un dev solo.
- Pas d'auto-hébergement Supabase complet (usine à gaz) — la cible VPS = Postgres nu + app + auth intégrée.
- Pas de migration VPS avant la Phase 9 — Docker garantit la portabilité en continu, ça suffit.

---

## SUIVI
*(à mettre à jour à chaque session)*

| Phase | Statut | Notes |
|---|---|---|
| 0 — Protéger l'existant | ☐ à faire | |
| 1 — Conception | ☐ à faire | |
| 2 — Fondation | ✅ fait | monorepo pnpm (schemas/db/auth/web), Next.js 15+Tailwind (charte), Docker+compose testé, en-têtes sécurité, CI verte, Dependabot. Déploiement Vercel fait (par Kamel, en clics) — build "success" confirmé via l'API Vercel (commit 9d7e6e2). URL protégée par Vercel Authentication, non vérifiée visuellement par l'agent. |
| 3 — API | ✅ fait | `/api/v1` complet (public+auth+admin), migrations SQL schéma v2 (Postgres local uniquement, prod v1 non touchée), rate limiting Postgres-backé, Turnstile soumission, audit log admin, spec OpenAPI, tests d'intégration + job CI dédié (Postgres jetable + secrets Supabase dev). CI verte (3 jobs). |
| 4 — Web | ☐ à faire | |
| 5 — SEO | ☐ à faire | |
| 6 — Bascule prod | ☐ à faire | **Checklist avant bascule** : SMTP custom pour Supabase Auth (le SMTP partagé par défaut est rate-limité — `429 over_email_send_rate_limit` dès la 2e inscription en test, `fidwastafid.dev` a même été rejeté comme domaine invalide faute de MX) + réactiver "Confirm email" (désactivé temporairement en Phase 4 pour tester l'inscription en dev) + vérifier le domaine `fidwastafid.dev`. |
| 7 — Pipeline | ☐ à faire | |
| 8 — Mobile & ops | ☐ à faire | |
| 9 — VPS | ☐ conditionnel | |

**PROCHAINE TÂCHE** : Phase 4 — le web comme premier client (feed SSR, page deal, pages enseignes, auth/votes/commentaires/soumission via l'API, admin pipeline, redesign charte).

---

## ESTIMATION GLOBALE

~16-20 sessions réparties sur 6-10 semaines selon le rythme. Chaque phase livre quelque chose de fermé et d'utilisable. Le site actuel reste en prod jusqu'à la Phase 6 — zéro interruption pour la communauté.

**Coûts** : construction ~0-20 €/mois → monétisation ~35-45 €/mois (managé) → cible VPS ~12-18 €/mois tout compris.
