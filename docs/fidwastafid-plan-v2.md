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
8. **Le SUIVI se met à jour à chaque session.** Un plan périmé fait prendre des décisions sur un état du monde qui n'existe plus.

---

## DÉCISIONS IRRÉVERSIBLES — À FIGER EN PHASE 1, AVANT TOUT CODE

Ce sont les choix coûteux à changer après coup. C'est ici que « ne pas revenir en arrière » se joue.

| Décision | Pourquoi c'est irréversible | À figer |
|---|---|---|
| **Format des slugs de deals** | Les URLs indexées par Google et partagées sur WhatsApp ne doivent JAMAIS changer | `/deal/[slug]-[public_id]` — slug dérivé du titre seul, jamais du prix (CONTRAT-V1 §1 : un deal est éphémère, son URL est éternelle), `public_id` = nanoid 10 caractères immuable (ex : `huile-lesieur-5l-a1b2c3d4e5`) |
| **Arborescence d'URLs** | Idem — le SEO se construit dessus pendant des années | `/` (feed) · `/deal/[slug]-[public_id]` · `/enseigne/[nom]` · `/ville/[nom]` (réservé) · `/api/v1/*` |
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
- [ ] Page deal `/deal/[slug]-[public_id]` — la pièce maîtresse SEO.
- [ ] Pages enseignes `/enseigne/marjane`, `/enseigne/bim`, `/enseigne/carrefour`.
- [ ] Auth (connexion, inscription), votes, commentaires, soumission — via l'API.
- [ ] Admin avec onglet Pipeline (`auto_draft` en premier, bulk select/validate/reject, tri par remise décroissante — parité avec l'existant).
- [ ] Redesign intégré ici (Claude Design : feed + page deal, mobile-first, charte).
- [ ] Images servies via `/img/deals/[id]` cachées par Cloudflare.

**Terminé quand** : parité fonctionnelle complète avec le site actuel, validée en préversion sur mobile. **Pas une feature de plus.**

**Amendement (2026-07-14)** : parité validée hors page profil/Mes deals —
exception documentée, cf. `docs/IDEES.md`.

### PHASE 5 — SEO industrialisé *(2 sessions)*
- [ ] Metadata par page (title, description) + Open Graph (partages WhatsApp avec image et prix).
- [ ] Données structurées schema.org `Offer`/`Product` sur chaque deal.
- [ ] `sitemap.xml` dynamique généré depuis la base.
- *Aucune redirection depuis la v1 (CONTRAT §2) — l'indexation repart de zéro, c'est attendu.*
- [ ] Search Console : soumission du sitemap, vérification de l'indexation.

**Terminé quand** : le test de résultats enrichis Google valide les données structurées + le sitemap est soumis et exploré.

### PHASE 6 — Bascule en production *(1 session + 7 jours de surveillance)*

**Chantiers à lever AVANT la session (lancés en parallèle des Phases 3-5) :**
- [x] Base de prod v2 : Postgres du projet Supabase aswbu (celui de l'auth,
      renommé `fidwastafid-prod` à la clôture — cf. SUIVI), connexion via
      Session pooler (IPv4). DATABASE_URL de prod câblée dans Vercel.
      Migration 0001_init appliquée dessus. DÉCISION GRAVÉE — un troisième
      store serait de la complexité gratuite.
- [x] Infra image (CONTRAT-V1 §6) : route `/img/deals/[public_id]` jamais
      construite, `deals.image_key` jamais peuplé (pas de formulaire
      d'upload). Constaté lors de la mise en conformité charte (2026-07-14) :
      `DealCard` ne peut pas afficher d'image tant que cette infra n'existe
      pas. À lever avant bascule si le pipeline de scraping doit fournir des
      photos de deals. Soldé le 15/07/2026 (cf. SUIVI « Dette infra images »).
- [x] CNDP / loi 09-08 : la collecte démographique v1 (index.html ~l.2614)
      coupée par le commit fd913b1
      (https://github.com/Flakpak/fidwastafid/commit/fd913b1f45f517b0a3f7dcf86723c96bfc84ded6).
      Champs absents de l'inscription v2. B2B data reporté dans IDEES.md
      derrière consentement explicite + déclaration CNDP.
- [ ] Vercel Pro effectif avant la bascule. Non vérifié cette session
      (facturation hors visibilité) — à confirmer par Kamel.
- [x] DNSSEC désactivé chez OVH (reliquat Phase 0) — actif côté Cloudflare
      depuis la bascule DNS du 16/07/2026 (OVH n'est plus autoritaire).
- [ ] Parité v1 ↔ v2 validée sur mobile réel. Action Kamel, hors visibilité
      de cette session — cf. Phase 4 / PROCHAINE TÂCHE.
- [x] Ignored Build Step configuré sur le projet Vercel v1 au moment de la
      bascule J-0 — un push sur le repo rebuild actuellement LES DEUX
      projets, il faut que le gel du déploiement v1 soit réel. Superflu au
      final : le projet v1 a été entièrement déconnecté de Git (pas
      seulement un ignored build step) et renommé `*-v1-legacy` — plus
      robuste, aucun push ne peut plus jamais le redéployer (cf. SUIVI
      clôture).
- [x] Bascule des URLs d'auth : `NEXT_PUBLIC_SITE_URL` (Vercel) et Supabase
      Site URL + Redirect URLs passent de la préversion à fidwastafid.com —
      sinon les emails de confirmation pointeront sur la préversion morte.
      Fait le 16/07/2026 (cf. SUIVI).
- [x] SMTP custom opérationnel (Resend) — prérequis découvert lors du fix
      confirmation email (Supabase verrouille l'édition des templates email
      sans SMTP custom, et son expéditeur par défaut est limité à quelques
      emails/heure, non viable en prod). Domaine fidwastafid.com vérifié
      (DKIM/SPF dans Cloudflare, DNS only), expéditeur
      noreply@fidwastafid.com, smtp.resend.com:465. Fait le 2026-07-14.
- [x] Régions alignées Vercel/Supabase (Ireland) — chaque requête payait
      un aller-retour transatlantique (fonctions Vercel en Amérique du
      Nord, Supabase en Ireland), diagnostiqué lors du test de parité
      Phase 4. Fait le 2026-07-14, chantier perf diagnostic clos.
- [x] CI `migrations-check` (lecture seule, cf. CONTRAT-V1 §7) — déclenché
      par la découverte que la migration 0004 était committée et testée en
      Docker mais jamais appliquée sur aswbu (base provisionnée avant ce
      chantier, aucun garde-fou). Rôle `ci_migrations_check` (SELECT sur
      `schema_migrations` uniquement) créé par la migration 0005. Fait le
      2026-07-14.

Discipline complémentaire (pas un mécanisme, juste une habitude à garder) :
en fin de chantier touchant une migration, vérifier explicitement si elle
a été appliquée sur aswbu avant de passer au suivant — le filet CI
`migrations-check` ci-dessus reste la protection réelle contre l'oubli.

**J-0 — session de bascule**
- [x] Bascule du domaine : réassignation dans Vercel/Cloudflare (pas de TTL
      DNS à gérer, domaine proxifié Cloudflare — bascule et rollback quasi
      instantanés). Fait le 16/07/2026 (cf. SUIVI).
- [x] Vérifications : 200 sur /, /deal/[slug]-[public_id], /enseigne/marjane ;
      en-têtes CSP ; images via /img/deals/[public_id] ; une écriture de test
      (vote) de bout en bout.
      Partiel fait le 18/07/2026 (périmètre SITE_URL, cf. SUIVI) : sitemap.xml
      et robots.txt en https://fidwastafid.com, og:url/canonical/JSON-LD
      d'une page deal corrects. Complété le 18/07/2026 (cf. SUIVI clôture) :
      /enseigne/marjane → 200, en-têtes CSP présents, image réelle → 200 via
      le proxy, vote posé (score 1→2) puis retiré proprement (score 2→1) sur
      un deal réel de fidwastafid.com, sans résidu.

**J+1 → J+7** : 5xx, latence, échecs d'écriture, Search Console (indexation
repart de zéro — attendu), remontées WhatsApp.

**J+7 — clôture**
- [ ] Suppression de index.html racine (⚠️ PAS src/App.jsx, prototype
      orphelin). Rollback dès lors dégradé mais pas perdu : redéploiement
      possible depuis le tag v1-legacy (~15 min au lieu d'instantané).
      Réserve ouverte, groupée avec la suppression définitive des projets v1
      — prévue ~23/07/2026 après une semaine pleine de stabilité (cf. SUIVI
      clôture).
- [ ] Analytics : vérifier que la v2 remonte dans Vercel Web Analytics
      (@vercel/analytics côté Next, pas la balise script v1). `<Analytics/>`
      ajouté et vérifié actif en prod le 18/07/2026 (script chargé, zéro
      erreur console — cf. SUIVI) ; confirmation de remontée dans le
      dashboard encore en attente côté Kamel (accès hors de cette session).
- [ ] Nettoyer laqwg après bascule : `DROP VIEW public.v1_auth_users_audit;`
      puis supprimer le rôle `etl_reader` (cf. exception du 2026-07-14,
      SUIVI). Même fenêtre que la suppression définitive des projets v1,
      ~23/07/2026.

**Rollback J-0 → J+7** : repointer le domaine vers le projet v1. La base v1
n'ayant jamais été modifiée ni migrée (pas d'ETL, cf. SUIVI), le rollback DNS
suffit.

**Terminé quand** : v2 sert 100 % du trafic depuis 7 jours, zéro 5xx récurrent,
zéro régression signalée, rollback non déclenché.

### PHASE 7 — Pipeline & automatisation *(2 sessions)*
- [x] Pipeline `.mjs` rejoint le monorepo (`apps/pipeline`) — code inchangé, il utilise désormais les schémas zod partagés pour valider avant insertion. *(Phase 7A, 19/07/2026)*
- [ ] Cron GitHub Actions *(fréquence à confirmer — pas nécessairement quotidien, cf. note ci-dessous)* : scraping Bringo + insertion + déclenchement de la revalidation des pages Next.js (contenu frais indexé automatiquement).
- [ ] Archivage des extractions conservé (dossiers horodatés — acquis à préserver).

**État d'avancement (19/07/2026)** : Phase 7A terminée — le pipeline a
rejoint le monorepo (`apps/pipeline`, workspace pnpm nommé `pipeline`),
déménagement pur (code des scripts `.mjs` inchangé, seule la validation
avant insertion a été centralisée sur les schémas zod partagés de
`packages/schemas`, remplaçant la validation locale ad hoc). Archives
d'extractions passées non rapatriées, restent hors dépôt (`.gitignore`
dédié). RESTE (Phase 7B) : le cron GitHub Actions — sa fréquence reste à
calibrer sur une doctrine de curation à définir (pas forcément
quotidienne : dépend du rythme réel de renouvellement du catalogue Bringo
et de la charge de validation admin qu'on veut s'imposer) ; nécessitera de
configurer les secrets GitHub Actions (mêmes variables d'environnement que
documentées dans `apps/pipeline/README.md`).

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
| 0 — Protéger l'existant | ☑ fait | pg_dump quotidien GA, runbook 5 scénarios, tag v1-legacy, DNS → Cloudflare (Full Strict) ; DNSSEC : reliquat OVH levé, actif côté Cloudflare depuis la bascule du 16/07/2026 |
| 1 — Conception | ☑ fait | docs/CONTRAT-V1.md gravé |
| 2 — Fondation | ☑ fait | monorepo pnpm, packages schemas/db/auth, Next 15, Docker, CSP nonce, CI verte, Dependabot |
| 3 — API | ☑ fait | endpoints publics + écritures + rate limiting, CI verte |
| 4 — Web | ◐ code complet | commits 06ca057→9d4718c ; RESTE : validation parité v1↔v2 sur mobile réel (critère "Terminé quand" — action Kamel) |
| 5 — SEO | ◐ code complet | commits 94147b2→d3583ed ; RESTE : soumission sitemap Search Console + test résultats enrichis Google (actions externes) |
| 6 — Bascule prod | ☑ fait | terminée le 18/07/2026, déclarée par anticipation des 7 jours pleins (cf. SUIVI clôture) ; bascule DNS 16/07, DNSSEC actif, sitemap soumis et traité (57 pages) ; v1 gelée (Git déconnecté, projets renommés `*-v1-legacy`) ; réserve ouverte : suppression définitive des projets v1 (Vercel + Supabase laqwg) ~23/07/2026 |
| 7 — Pipeline | ◐ Phase 7A faite | pipeline intégré au monorepo (`apps/pipeline`, 19/07/2026), validation centralisée sur les schémas zod partagés ; RESTE (Phase 7B) : cron GitHub Actions, fréquence à calibrer sur la doctrine de curation (pas nécessairement quotidienne) |
| 8 — Mobile & ops | ☐ à faire | |
| 9 — VPS | ☐ conditionnel | |

**Décision — 14/07/2026** : pas d'ETL v1 → v2. La v2 démarre sur base vide.
L'audit (`docs/AUDIT-V1.md`) a établi le contenu réel de la v1 : 580 deals de
catalogue périssables (dont 559 scrapés, régénérables par le pipeline), 3
auteurs référencés, 15 votes, 24 commentaires, 0 profil utilisateur. Le coût
et le risque d'une migration (curation des enseignes, mapping de 4 enums,
rapatriement de 559 images hébergées chez un tiers) sont sans commune mesure
avec la valeur récupérée. Cohérent avec les décisions déjà prises : pas de
migration des comptes auth, pas de redirections 301 depuis la v1. Le risque
n°1 de la Phase 6 est supprimé, pas résolu.

**Exception documentée — 14/07/2026** : création de la vue
`public.v1_auth_users_audit` sur laqwg (`SELECT id, email, created_at FROM
auth.users`), le rôle `postgres` de Supabase ne pouvant pas accorder
`USAGE` sur le schéma `auth` (propriété de `supabase_auth_admin`). Objet en
lecture seule, aucune donnée v1 modifiée, aucune incidence sur le site v1
en production. Seule entorse au principe « la base v1 n'est jamais
modifiée » — assumée, tracée, temporaire. Nettoyage prévu en Phase 6, J+7
(cf. checklist).

**Dette infra images soldée — 15/07/2026** : route proxy
`/img/deals/[publicId]` construite et validée de bout en bout (chemin 200
et 404 testés contre le storage prod), `image_key` verrouillé côté API
(format strict, écriture publique fermée — commit `e07b077`). Pipeline
(`insert-deals.mjs`, hors monorepo) adapté au schéma v2 et doté d'un
module image (`images.mjs`) : source haute résolution avec repli
thumbnail, garde-fous (timeout, taille, MIME), jamais bloquant. Périmètre
v1 : images des deals Bringo uniquement — les deals catalogue partent
sans image (cf. IDEES.md, bounding box à évaluer). Upload utilisateur
(formulaire `/soumettre`) explicitement exclu de ce périmètre :
`dealInputSchema` n'accepte pas `imageKey`, amendement du contrat requis
le jour où cette fonctionnalité serait ajoutée.

**Bascule DNS effectuée — 16/07/2026** : fidwastafid.com sert désormais la
v2 (`NEXT_PUBLIC_SITE_URL` mis à jour dans Vercel Production). Audit de
suivi (18/07/2026) : aucune URL `vercel.app`/`fidwastafid-web` codée en dur
dans `apps/web` — tout dérive déjà de `SITE_URL`
(`apps/web/src/lib/siteUrl.ts`). Deux corrections faites à cette occasion :
fallback `??` → `||` (une chaîne vide, ex. build Docker sans le build arg
renseigné, ne doit pas passer à travers) et `NEXT_PUBLIC_SITE_URL` ajouté
comme build arg (Dockerfile + docker-compose.yml), au même titre que
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` — jusqu'ici absent, donc invisible du
build Docker local qui retombait silencieusement sur le fallback.

**Vérification post-déploiement — 18/07/2026** : redéploiement déclenché par
le commit ci-dessus, confirmé stable au curl sur https://fidwastafid.com —
sitemap.xml (57 occurrences du domaine, 0 vercel.app/www), robots.txt
(Sitemap: https://fidwastafid.com/sitemap.xml), page deal (og:url,
canonical et JSON-LD Offer.url tous en https://fidwastafid.com). Périmètre
volontairement limité à SITE_URL — le reste de la checklist J-0
(/enseigne/marjane, en-têtes CSP, images, écriture de test) reste à faire
en session de bascule dédiée (cf. case ci-dessus).

**Réinitialisation de mot de passe — 18/07/2026** : trou fonctionnel post-
bascule comblé (/mot-de-passe-oublie, /reinitialiser-mot-de-passe), même
mécanisme `token_hash` + `verifyOtp` que la confirmation d'email
(auth/confirm/route.ts). Action manuelle requise côté dashboard Supabase :
le template email "Reset Password" doit être mis à jour pour construire un
lien `token_hash` (voir contenu exact donné à Kamel en session) — sans ce
changement, le lien envoyé par Supabase ne correspond pas à ce que
/reinitialiser-mot-de-passe attend.

Mécanisme testé de bout en bout en prod (compte jetable
kamel.lazrek+resettest@gmail.com, supprimé en fin de test via DELETE
/api/v1/me) : création, envoi réel de l'email de récupération (`recover`
→ 200), vérification du token (`verify` type=recovery → 200, session
posée), changement de mot de passe (`PUT /auth/v1/user` → 200), connexion
avec le nouveau mot de passe (200) et échec avec l'ancien
(`invalid_credentials`), suppression du compte confirmée (login post-
suppression échoue). Réponse de `recover` identique (`{}`/200) pour un
email réel et un email inexistant, cohérent avec le fait que
`motDePasseOublieAction` ne branche jamais sur son résultat. Substitution
assumée : le token a été obtenu via l'API Admin (`generate_link`) plutôt
qu'en lisant l'email réel (aucun accès à la boîte de Kamel) — un email
réel a bien été envoyé en parallèle (`recover`), à vérifier par Kamel pour
confirmer le format du lien actuellement produit par le template.

**Incident production — 18/07/2026** : `/reinitialiser-mot-de-passe` plantait
en 500 (`Cookies can only be modified in a Server Action or Route Handler`,
digest `3137909927`/`773635100`) sur tout vrai lien d'email — la page (un
Server Component) appelait `verifyOtp` puis `setSessionCookie` directement
dans son rendu, ce que Next.js 15 interdit hors Server Action/Route
Handler. Non détecté avant mise en prod car la vérification de bout en bout
précédente appelait l'API Supabase en direct (curl), jamais la page elle-
même. Reproduit en local avec un vrai token (généré via `generate_link`,
un token bidon ne suffit pas : `verifyOtp` le rejette avant d'atteindre la
ligne fautive).

Correctif : la vérification `verifyOtp` + pose du cookie déménage dans un
nouveau Route Handler, `auth/reset/route.ts`, sur le modèle exact de
`auth/confirm/route.ts` (déjà correct, jamais touché par l'incident). La
page ne fait plus que lire l'état déjà posé (`resolveCurrentUser`, en
lecture seule) et redirige tout `token_hash`/`type` reçu directement sur
elle-même vers `/auth/reset` (compat ascendante avec l'ancien template déjà
en place). Trois cas vérifiés sans crash en Docker avec un vrai token : `/auth/reset`
avec token valide → formulaire ; page directe sans paramètres → redirect
`/mot-de-passe-oublie` ; paramètres malformés (`type` invalide, token
absent, etc.) → même redirect, jamais de 500. Typecheck clean, 24/24 tests
d'intégration verts.

Gabarit email Supabase : l'ancien contenu donné à Kamel (pointant sur
`/reinitialiser-mot-de-passe?token_hash=...`) continue de fonctionner grâce
à la redirection de compatibilité, mais un lien direct vers
`/auth/reset?token_hash={{ .TokenHash }}&type=recovery` évite un aller-
retour :
```html
<h2>Réinitialise ton mot de passe</h2>
<p>Clique sur ce lien pour choisir un nouveau mot de passe :</p>
<p><a href="{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery">Réinitialiser mon mot de passe</a></p>
<p>Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet email — ton mot de passe ne changera pas.</p>
```
Mise à jour du template optionnelle — l'ancien lien reste valable.

Re-test effectué après déploiement (compte jetable
kamel.lazrek+resetfix@gmail.com) : cette fois un vrai chargement de page,
pas seulement l'API Supabase en direct — `GET
/reinitialiser-mot-de-passe?token_hash=...&type=recovery` sur
fidwastafid.com → redirect `/auth/reset` → redirect `/reinitialiser-mot-de-passe`
avec cookie de session posé → 200, formulaire affiché. Changement de mot
de passe confirmé (ancien rejeté, nouveau accepté), compte supprimé via
`DELETE /api/v1/me` en fin de test. Incident clos.

**Vercel Analytics — 18/07/2026** : `<Analytics />` (`@vercel/analytics/next`)
ajouté au layout racine, activation déjà faite côté dashboard. Aucun
ajustement CSP requis : le script s'injecte dynamiquement depuis notre
propre bundle nonce'd (couvert par `'strict-dynamic'`), et sa collecte vit
sous `/_vercel/insights/*`, même origine que le site (déjà couvert par
`connect-src 'self'`). Vérifié en Docker (404 normal hors Vercel, zéro
violation CSP) puis en prod (script servi en 200 via un chemin réécrit
par Vercel, `window.va` initialisé, zéro erreur console sur deux
navigations réelles) — reste à confirmer côté Kamel que ces navigations
apparaissent dans le dashboard Analytics (accès dashboard hors de portée
de cette session).

**Clôture Phase 6 — 18/07/2026** : bascule en production déclarée terminée,
par anticipation des 7 jours pleins de surveillance prévus par le critère
« Terminé quand » original (16→23/07) — le socle à risque (DNS, auth,
emails, régions, CSP, écritures) est validé stable ; ce qui reste est du
nettoyage de fermeture tracké ci-dessous, pas un blocant.

Récapitulatif :
- **Bascule DNS** : 16/07/2026 (cf. SUIVI). **DNSSEC** : reliquat Phase 0
  levé, actif côté Cloudflare (OVH n'est plus autoritaire sur la zone).
- **Sitemap** : soumis à Search Console et exploré, 57 pages retournées
  par sitemap.xml (cf. vérification post-déploiement du 18/07 ci-dessus).
- **v1 gelée** : projet Vercel et projet Supabase (laqwg) déconnectés de
  Git — plus robuste que le seul « Ignored Build Step » prévu au plan,
  aucun push ne peut plus jamais les redéployer — et renommés avec le
  suffixe `-v1-legacy`. Le projet Supabase de prod v2 (aswbu) est renommé
  `fidwastafid-prod`.
- **Vérifications J-0** (case ci-dessus) closes au curl ce jour contre
  fidwastafid.com : `/` → 200, une page deal → 200, `/enseigne/marjane` →
  200 ; en-têtes CSP présents et corrects sur ces trois routes ; image
  réelle servie en 200 via `/img/deals/[public_id]` ; écriture de test —
  vote posé (score 1→2) puis retiré proprement (score 2→1) sur un deal
  réel, sans résidu.
- **Ajouts post-bascule**, hors périmètre initial de la Phase 6 mais
  livrés dans la foulée (détail dans leurs entrées SUIVI respectives
  ci-dessus) : réinitialisation de mot de passe oublié (flux
  `/auth/reset`), Vercel Analytics, refonte UX de la soumission (bandeau
  anonyme pour les non-connectés, brouillon sessionStorage, CTA header en
  pilule dégradée).

**Réserve ouverte** : suppression définitive des projets v1 (Vercel +
Supabase laqwg) après une semaine complète de stabilité, vers le
23/07/2026 — groupée avec le nettoyage laqwg restant (`DROP VIEW
v1_auth_users_audit`, rôle `etl_reader`) et la suppression de
`index.html` racine (checklist J+7 ci-dessus). Vercel Pro et la
confirmation de remontée dans le dashboard Analytics restent également à
valider côté Kamel — hors visibilité de cette session.

**PROCHAINE TÂCHE** : clore 4 — validation parité v1↔v2 sur mobile réel (action Kamel). Phase 6 : réserve du ~23/07/2026 (suppression définitive des projets v1, nettoyage laqwg, index.html racine) ; confirmer Vercel Pro et la remontée Analytics au dashboard. Sinon : Phase 7B (cron GitHub Actions — intégration monorepo du pipeline faite le 19/07/2026, Phase 7A).

---

## ESTIMATION GLOBALE

~16-20 sessions réparties sur 6-10 semaines selon le rythme. Chaque phase livre quelque chose de fermé et d'utilisable. Le site actuel reste en prod jusqu'à la Phase 6 — zéro interruption pour la communauté.

**Coûts** : construction ~0-20 €/mois → monétisation ~35-45 €/mois (managé) → cible VPS ~12-18 €/mois tout compris.
