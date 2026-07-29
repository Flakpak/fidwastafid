# IDÉES — à trier après la mise en prod de la v2

*(CONTRAT-V1.md / PRINCIPES NON NÉGOCIABLES §6 : aucune feature ajoutée en cours de phase — les idées atterrissent ici, triées après la Phase 6.)*

## Dette technique temporaire

*(Le log temporaire `[turnstile-diag]` a été retiré le 26/07/2026 : la
journalisation d'échec est désormais permanente et structurée dans
`_lib/turnstile.ts`, avec le statut HTTP et le nombre de tentatives — elle
n'est plus un diagnostic ponctuel mais une propriété du wrapper.)*

- ~~`apps/web/public/openapi.json` est un artefact généré qu'AUCUN job CI ne
  vérifie.~~ **Fait le 27/07/2026** — job `openapi-check` (commit 3ddfaa3) :
  régénère puis `git diff --exit-code`. Conservé ici pour le fait générateur :
  `emailIndisponible`, ajouté à `/me` par le correctif du 24/07, n'était jamais
  arrivé dans la spec publiée, qui affirmait encore `email` requis pendant
  trois jours. Une spec peut mentir sur l'API sans que rien ne rougisse —
  version documentaire du fallback silencieux.

- ~~**Le journal d'audit enregistre des modifications fantômes**~~ **Corrigé le
  27/07/2026** — `_lib/auditDiff.ts` : normalisation par type déclaré (`nombre`
  / `texte` / `booleen`) des deux côtés, puis filtrage — seuls les champs
  réellement modifiés entrent au journal. Fait générateur conservé : entrée
  `journal_audit` #240, un enregistrement sans changement réel avait produit
  `prixPromo: "100.00" → 100` (colonne `numeric` renvoyée en **chaîne** par pg,
  comparée à un **nombre** JS — inégalité de type, pas de valeur) plus quatre
  autres champs identiques de part et d'autre, parce qu'**aucune comparaison
  n'était faite** : tout champ présent dans le corps entrait dans le diff.
  Deuxième défaut trouvé au passage : `enseigne_id` (`bigint`) revient aussi en
  chaîne, et était typé `number` — le faux diff `"3" → 3` attendait son tour.
  Couvert par un test unitaire (le helper) **et** un test d'intégration (rejeu
  d'un PATCH identique sur de vrais types pg, seule preuve possible du
  round-trip).
- ~~**Rejet sans motif**~~ **Tranché le 27/07/2026 : le motif devient
  obligatoire.** Amendement du CONTRAT-V1 §3 (contrainte applicative, colonne
  laissée `null`-able pour les 129 rejets historiques), refus 400 sur les deux
  chemins d'écriture (`PATCH` unitaire et `bulk`), et six motifs préenregistrés
  en un clic dans le back-office. La cause n'était pas la négligence : le champ
  vivait replié au fond du panneau d'édition alors que « Rejeter » était en haut
  de la carte — on pouvait rejeter sans jamais le voir. Un champ obligatoire
  sans raccourci se remplit de « x » ; l'agencement fait partie de la garantie.

## Refonte Tadelakt — suites (2026-07-24)

- Brancher le vote courant en SSR/API pour un état voté persistant — lot
  données post-refonte. `CardVote` affiche aujourd'hui un état « voté » (fond
  plein `hot`/`cold`) optimiste côté client : il ne reçoit que le score, pas le
  sens du vote de l'utilisateur, donc l'état ne survit pas à un rechargement.

## ~~Bloc de marque du rail d'accueil — RETRAIT ASSUMÉ (2026-07-28)~~ — ANNULÉ le 28/07/2026

> **Le retrait décrit ci-dessous n'a pas tenu la revue visuelle**, le jour même.
> Le bloc de marque (monogramme FwS + « Bons plans marocains »), le lien
> « Le concept Fidwastafid » et le CTA de soumission sont RÉTABLIS dans la
> colonne latérale, à leur place et dans leur style d'origine. L'argument des
> trois rappels de marque n'a pas résisté à l'écran : sans son bloc de tête,
> la colonne démarrait à froid sur une liste de filtres.
>
> Ce qui subsiste de la décision : la ligne de clôture du hero, née de ce
> retrait, est conservée **en mobile uniquement** (`md:hidden`). Sous md il n'y
> a pas de colonne, et l'ancien rail — `hidden md:flex` — n'a jamais offert ces
> deux entrées aux mobiles. Au-dessus de md, la colonne les porte seule : les
> deux ne coexistent jamais à l'écran.
>
> Note conservée ci-dessous pour la trace du raisonnement, pas comme état actuel.

## Bloc de marque du rail d'accueil — retrait (2026-07-28, annulé)

Le lot 7 (refonte des filtres, PR #59) a supprimé le rail desktop de l'accueil :
sa navigation par catégories et son tri faisaient doublon avec la nouvelle barre,
et ses 220px empêchaient la rangée unique de tenir sans défilement horizontal
(1347px mesurés pour 1265 disponibles à 1280px de large).

Deux entrées du rail ont été **récupérées** en ligne de clôture du hero (CTA de
soumission `فيد و ستافيد` et lien « Le concept Fidwastafid ») — elles y sont
désormais visibles en mobile ET en desktop, alors que le rail était
`hidden md:flex`.

Une troisième ne l'a **pas** été, volontairement : le bloc de marque du rail —
monogramme FwS (`Brand forme="mark" hauteur={72}`) surmonté de la mention
« Bons plans marocains ».

**Motif** : avec le logotype de l'en-tête et le hero juste dessous, il portait le
troisième rappel de marque d'un même écran. La charte Tadelakt tient la page pour
un cadre plâtre + encre où « l'UI est un cadre, pas un concurrent »
(CONTRAT-V1 §8, principe 1) — trois marquages dans le premier écran vont contre.

**Ce n'est donc pas un oubli.** Si la question revient : la décision a été prise
le 28/07/2026, en connaissance de ce qui disparaissait, et la chaîne
« Bons plans marocains » n'existe plus nulle part dans le dépôt (vérifié). La
rétablir suppose de décider d'abord lequel des trois rappels de marque cède la
place.

## ~~Scaffold Vite/React racine résiduel (2026-07-21)~~ — FAIT le 27/07/2026

> Décommissionné : `index.html`, `vite.config.js`, `src/`, `package-lock.json`,
> les scripts `dev`/`build`/`preview` et les dépendances associées du
> `package.json` racine (react, react-dom, vite, @vitejs/plugin-react,
> @types/react, @types/react-dom, eslint-plugin-react-refresh,
> @supabase/supabase-js — chacune déclarée par ailleurs dans le workspace qui
> l'utilise réellement). Le bloc eslint `**/*.{js,jsx}`, qui n'existait que
> pour cette app, est remplacé par un bloc `**/*.js` en globals Node.
>
> Audit préalable — aucun consommateur actif : **Vercel** construit `apps/web`
> en Root Directory (`Running "pnpm run build"` → `next build`, lu dans le log
> de build du déploiement de prod, pas déduit) ; la **CI** ne lance jamais
> `pnpm build` racine (`lint`/`typecheck`/`test` + job docker sur le
> Dockerfile) ; le **Dockerfile** ne construit que
> `--filter @fidwastafid/web` ; `.claude/launch.json` cible `@fidwastafid/web` ;
> `package-lock.json` n'était lu par aucun `npm ci`. Le projet Vercel v1 avait
> été supprimé le 21/07 et le routage v1 était en hash, jamais indexé
> (CONTRAT-V1 §2).
>
> Limite acceptée : plusieurs commentaires du code citent `index.html` comme
> source de portage (`packages/schemas/src/enums.ts` pour VILLES/CATEGORIES,
> `apps/web/src/lib/format.ts`, `HeroBand.tsx`, `Ticker.tsx`…). Ces
> références restent exactes historiquement mais ne pointent plus vers un
> fichier présent : la provenance se relit désormais dans l'historique git et
> au tag `v1-legacy`.

*Texte d'origine conservé pour le fait générateur :*

`index.html`, `vite.config.js`, `src/App.jsx`, `src/main.jsx`,
`src/index.css`, `src/assets` à la racine du repo, plus les scripts
`dev`/`build`/`preview` (et les dépendances `vite`/`react`/`react-dom`)
du `package.json` racine : reliquat du prototype v1 (avant le passage à
Next.js dans `apps/web`, cf. `docs/fidwastafid-plan-v2.md` — « PAS
src/App.jsx, prototype orphelin »). Découvert lors du lot nettoyage
outillage mort du 21/07/2026 : `index.html` s'est révélé être une
référence active (`pnpm build` racine dépend de lui via la convention
d'entrée par défaut de Vite), donc non supprimable par un simple `git
rm`. Décommissionner proprement nécessite de retirer aussi
`vite.config.js`, `src/`, les scripts et les dépendances associées du
`package.json` racine — plus gros qu'une suppression isolée, chantier à
part.

**Argument nouveau du 27/07/2026 — ce reliquat coûte maintenant en bruit de
sécurité.** À la réactivation des alertes Dependabot, **15 des 28 alertes
ouvertes** ne venaient pas du monorepo mais de **`package-lock.json`**, le
lockfile npm de ce prototype v1, toujours versionné à la racine (98 Ko, daté
du 11/07) et référencé par rien : ni `npm ci`, ni un workflow, ni le
Dockerfile — `pnpm` l'ignore complètement. C'est de là que sortent les seules
alertes `ws` (dont une `high` classée « runtime » alors qu'aucun build ne lit
ce fichier), et les alertes `vite`/`js-yaml`/`@babel/core`/`picomatch`, toutes
absentes de `pnpm audit`. Vérification croisée nette : 12 alertes sur
`pnpm-lock.yaml` + 1 sur `apps/web/package.json` = 13, exactement le compte de
`pnpm audit`. Le reste est le fantôme de la v1.

Conséquence pratique : tant que ce fichier reste versionné, chaque revue de
sécurité doit trier deux surfaces dont une est fictive, et Dependabot ouvrira
des PR contre un lockfile que personne ne construit. Le supprimer est la
première étape du décommissionnement, et la moins risquée (aucun consommateur).

## Dépendances — montées majeures parquées (2026-07-27)

> ⚠️ **L'`ignore semver-major` est une dette différée, pas une décision.**
> zod 4, TypeScript 7 et eslint 10 devront être traités : ce sont les versions
> vers lesquelles l'écosystème va, et rester sur les majeures précédentes se
> paiera un jour en incompatibilité de plugins, de types ou d'outillage. Le
> filtre ne résout rien — **il rend le sujet invisible**, ce qui est
> exactement le mécanisme par lequel une dette cesse d'être décidée pour
> devenir subie. C'est un report conscient, à durée non nulle mais non
> infinie.
>
> **Déclencheur de revue** (le premier qui se produit, pas une date — une date
> passe sans que personne ne la lise) :
>
> 1. un avis de sécurité tombe sur zod, typescript, eslint ou `@eslint/js` :
>    la mise à jour de sécurité passera outre l'`ignore` et arrivera seule,
>    peut-être sans chemin de montée propre — c'est le pire moment pour
>    découvrir la casse ;
> 2. une dépendance qu'on veut ajouter ou monter exige l'une de ces majeures
>    (peer dependency) : le report devient bloquant pour autre chose ;
> 3. la migration Next 16 / Turbopack est engagée (elle a sa propre règle
>    `ignore` ci-dessus) : elle touche le même outillage, autant grouper ;
> 4. à défaut, à la **première revue sécurité mensuelle qui suit la mise en
>    prod de la v2** (`docs/RUNBOOK-securite.md`), item Dependabot : relire
>    ces quatre entrées et décider — reconduire ou traiter, mais décider.
>
> Retirer une règle `ignore` est une ligne de YAML ; ce qui coûte, c'est la
> montée elle-même. Ne pas confondre les deux au moment de la revue.

*Tri du jour : les correctifs de sécurité et les montées à rayon d'impact nul
sont passés (next 15.5.21, sharp 0.35.3, lot sûr #30). Restent quatre chantiers
majeurs, parqués ici avec ce qui a été **constaté**, pas supposé. Les PR
Dependabot correspondantes sont fermées et une règle `ignore` sur
`version-update:semver-major` a été posée dans `.github/dependabot.yml` — sinon
elles reviennent chaque semaine et tiennent des places sur
`open-pull-requests-limit`. Ces règles ne masquent **pas** les correctifs de
sécurité : une mise à jour de sécurité n'est pas une mise à jour de version, et
elle ignore ces filtres comme la limite de PR ouvertes (vérifié le 27/07, voir
plus bas).*

- **zod 3.25.76 → 4.4.3** (ex-PR #11). **Casse réelle, mesurée** : `quality`
  **et** `docker` rouges — pas seulement les jobs privés de secrets. zod est le
  cœur de `packages/schemas`, donc de toute la validation d'API et du modèle de
  domaine gravé au CONTRAT-V1 §3. Chantier à part, avec relecture des messages
  d'erreur (le format `{ error: { code, message } }` du §4 en dépend).
  - **Rattaché à ce chantier : `@asteasolutions/zod-to-openapi` 7.3.4 → 9.1.0**
    (ex-PR #37, fermée le 27/07/2026). Ce n'est **pas** une décision séparée :
    depuis la 8.0, ses `peerDependencies` exigent `zod: ^4.0.0` (la 7.3.4
    demandait `^3.20.2`). Vérifié sur le registre npm, pas déduit. C'est aussi
    ce qui expliquait `openapi-check` rouge sur cette PR — la spec est générée
    par une bibliothèque qui attend un zod qu'on n'a pas. La monter seule
    laisserait un désaccord de peer dependency, ou tirerait zod 4 par la bande.
    Elle se traitera **dans le même lot** que zod 4, et elle en est un
    argument de plus : rester en zod 3 gèle aussi l'outillage OpenAPI.
- **typescript 5.9.3 → 7.0.2** (ex-PR #8). Même constat : `quality` et `docker`
  rouges. Majeure structurante, à planifier volontairement.
- **eslint 9.39.4 → 10.7.0 + @eslint/js 9.39.4 → 10.0.1** (ex-PR #9 et #7).
  **Indissociables** : les deux paquets sont versionnés ensemble en amont, et
  chaque PR séparée laisse le dépôt avec un désaccord de version entre le
  moteur et sa config. `quality` passait sur chacune prise isolément — ce qui
  ne prouve rien sur la paire. À monter d'un seul geste, en vérifiant les
  plugins (`eslint-plugin-react-hooks`, `typescript-eslint`).
- **@types/node 22.20.1 → 26.1.1** (ex-PR #10). **Ni 22 ni 26 n'est la bonne
  cible** : le runtime réel est **Node 24.x sur Vercel**, la CI tourne en
  **22**, et le dépôt déclare `^22.10.0`. Monter à 26 mettrait les types
  *au-dessus* du runtime — l'inverse du problème à résoudre. Le geste utile est
  d'aligner types et runtime (`^24`) et de trancher la version de CI, pas de
  suivre la dernière majeure publiée.

### Résidus transitifs connus, non traités

- **sharp 0.34.5 embarqué par next.** Notre dépendance directe est en 0.35.3
  (corrigée), mais `next@15.5.21` embarque sa propre copie 0.34.5 pour son
  optimiseur d'images — toujours porteuse de `GHSA-f88m-g3jw-g9cj`. Le dépôt
  n'importe `next/image` nulle part et ne configure aucun
  `images.remotePatterns` : les images de deal passent par la route proxy
  `/img/deals/[publicId]` (CONTRAT-V1 §6), jamais par `/_next/image`. La forcer
  demanderait un `overrides` pnpm sur une dépendance **native** du framework —
  à faire consciemment, pas au passage.
- **postcss (3 avis, dont 2 `high`)** : transitif de next également. Se résorbe
  par une montée de next, pas par une action de notre côté.
- **brace-expansion (`high`, dev)** : transitif d'eslint, se résorbe avec la
  montée eslint 10 ci-dessus.

### Ce que la limite de PR bloquait vraiment (mesuré)

`open-pull-requests-limit: 10` était saturé par 10 PR npm ouvertes, ce qui a
empêché Dependabot d'ouvrir la montée **de version** vers next 15.5.21 — 8 avis
ouverts, dont 3 `high`, sont ainsi restés sans PR. En revanche, dès les alertes
réactivées, Dependabot a ouvert sa PR **de sécurité** pour next (#26) alors que
les 10 places étaient encore prises : la limite ne s'applique donc pas aux
mises à jour de sécurité. Elle reste à 10 — la relever n'aurait rien débloqué.
Ce qui manquait était le canal de sécurité, pas des places.

## UX auth

- Inscription avec un email déjà utilisé (non confirmé) : Supabase
  n'envoie rien (anti-énumération), silence côté utilisateur — proposer
  de renvoyer l'email de confirmation plutôt que de laisser l'utilisateur
  sans retour. Comportement standard Supabase, pas un bug — juste une UX
  à améliorer.

## Profil / Mes deals

Page profil v1 (post-patch CNDP) réduite à une carte lecture seule dont
les stats (`score_reputation`, `deals_soumis`, ...) n'existent pas dans
le modèle v2. Absente en v2 — exception de parité consciente, cf.
CONTRAT-V1 §2/§4 (aucune de ces routes n'y figure), amendement Phase 4
ci-dessus.

**Mise à jour (18/07/2026)** : la partie « page profil minimale (pseudo,
email) + Mes deals » est livrée — `/compte` (4 cartes : identité avec
couleur d'avatar, contributions avec compteurs et liste `mesDeals`,
données/RGPD, suppression de compte). Ce qui reste une idée, pas encore
fait : l'**édition** des deals depuis `/compte` — nécessite un amendement
du contrat API (`PATCH` deal par son auteur → repasse `en_attente`, hors
de la liste fermée actuelle §4).

## Profil public /membre (2026-07-17)

`/membre/[pseudo]-[public_id]` réservé au contrat §2 mais jamais
construit — profil public consultable par tous (distinct de `/compte`,
qui est privé et authentifié). Dépendance directe : les enrichissements
« profil auteur » envisagés sur la page deal (membre depuis, nombre de
deals partagés, cf. entrée « Page deal — profil auteur » ci-dessous).

## Images (15/07/2026)

- Images des deals catalogue : `extract-catalogue.mjs` (pipeline, hors
  monorepo) n'extrait que l'image de la page entière du catalogue envoyée à
  Claude — aucune coordonnée par produit n'est disponible, donc aucune
  image individuelle associable à un deal catalogue (cf. audit du
  15/07/2026). Pour y remédier : demander une bounding box par produit dans
  le prompt d'extraction + recadrage `sharp` côté pipeline — chantier réel,
  coût/fiabilité à évaluer (fiabilité des bounding box retournées par
  l'API, temps de traitement). En attendant, les deals catalogue partent
  sans image ; seuls les deals Bringo (scraper) en ont une (module image,
  `images.mjs`).
- Qualité de `mapCategorie()` (scraper Bringo) : sur les 569 deals réels
  archivés, 375 (66 %) tombent dans "Autre" — le mapping par mots-clés sur
  `item_list_name` est trop pauvre pour catégoriser correctement le
  catalogue Carrefour/Bringo. Pistes : enrichir la liste de mots-clés, ou
  déléguer la catégorisation à l'API Claude à l'ingestion (comme
  `extract-catalogue.mjs` le fait déjà pour les catalogues).

## Favoris (2026-07-17)

Favoris/bookmark sur les cartes (type Dealabs) — nécessite table + endpoints
+ page mes-favoris, feature complète post-lancement.

## Page deal — profil auteur (2026-07-17)

Enrichissements profil auteur (membre depuis, nombre de deals partagés) :
dépend du futur `/membre/[pseudo]-[public_id]` réservé au contrat §2.

## Diversification des sources (2026-07-18)

Le pipeline ne scrape aujourd'hui que Bringo (`scraper-bringo.mjs`).
Marjane a déjà été exploré via `discover-site.mjs` (capture des appels API
+ rendu HTML, début juillet) sans suite donnée. Étendre à d'autres
enseignes (Marjane, Carrefour direct hors Bringo, etc.) élargirait la
couverture au-delà du catalogue actuel — chantier de découverte +
adaptation par source, un par un, post-Phase 7.

## Galerie multi-images (2026-07-18)

Chaque deal n'a aujourd'hui qu'une seule image (`deals.image_key`, module
pipeline `images.mjs`). Idée : galerie multi-images sur la page deal
(plusieurs angles/photos par produit, façon Dealabs) — nécessite d'étendre
le schéma (table `deal_images` ou tableau de clés sur `deals`) et le
pipeline d'extraction pour produire plusieurs images par deal quand la
source en fournit plusieurs.

## Staging Supabase — flux recette/prod (2026-07-18)

Aucun environnement de recette aujourd'hui : la seule base Postgres est
la prod (`fidwastafid-prod`, ex-aswbu), testée uniquement via Docker local
avant chaque déploiement. Idée : second projet Supabase gratuit dédié à
la recette, avec les variables d'environnement Preview Vercel pointant
vers ce projet staging plutôt que vers la prod — permettrait de tester des
migrations et changements risqués sur une base isolée avant qu'ils
n'atteignent la prod. Post-Phase 6, à évaluer contre le coût de
maintenance (deux schémas à garder synchronisés) pour un projet solo.

## Monétisation

Deals sponsorisés = colonne `sponsorise` boolean + badge sur la carte + critère de tri, post-Phase 6, quand il y aura un premier annonceur réel. Affiliation = paramètre de tracking sur le champ `lien` existant. Display ads (AdSense & co) : ÉCARTÉ — incompatible CSP par nonce, contraire au positionnement premium, rentable uniquement à fort volume.

## Stratégie d'audience (2026-07-20)

Cible primaire : Marocains résidents. Segment secondaire **stratégique**
(pas juste accessoire) : les MRE (Marocains résidant à l'étranger).

- **Pics saisonniers** : trafic MRE concentré sur l'été (retour au pays),
  période de forte consommation locale — à garder en tête pour tout
  calendrier éditorial ou opération commerciale future.
- **Rôle prescripteur** : un MRE qui repère un bon plan avant/pendant son
  séjour le partage à ses proches résidents (mécanique de partage
  WhatsApp, déjà le canal de diffusion naturel du site) — un lecteur MRE
  génère de la portée au-delà de sa propre lecture.
- **Langue** : le français est leur langue primaire de recherche/lecture,
  le site les sert donc déjà nativement, sans adaptation de contenu.
- **Implication GEO** : le déploiement Google AI Overviews/AI Mode en
  France (annoncé avant le 23/09/2026) concerne les recherches
  préparatoires des MRE **depuis la France** — le Maroc est déjà couvert
  par ce type de résultat depuis 2025, donc sans nouveauté à anticiper
  côté résidents.

**Décision** : pas de catégorie ni de contenu « spécial MRE » créé par
anticipation, sans données d'usage réelles pour le justifier — même
doctrine que la catégorie "Enfants" (absente de l'enum `categorie`,
réexaminée seulement si les données le justifient un jour, cf. Phase 7A).
Un segment stratégique n'est pas une raison de complexifier le modèle de
données à l'aveugle.

**Micro-actions GEO retenues** (coût zéro, à faire après le 23/07/2026— pas
avant, cf. Phase 6/rendez-vous suppression v1 en priorité) :
1. ~~Vérifier le balisage `schema.org` `Product`/`Offer` sur les pages deal~~
   — **fait le 21/07/2026** : `image` pointait vers le PNG générique du
   site même quand le deal avait une vraie photo, `seller` absent malgré
   une enseigne renseignée, `availability` d'un deal expiré en
   `OutOfStock` plutôt que `SoldOut` — corrigés (cf. section SEO ci-dessous).
2. ~~Autoriser explicitement les crawlers IA dans `robots.txt`~~ — **fait
   le 21/07/2026** : blocs explicites `Allow: /` pour GPTBot, OAI-SearchBot,
   ChatGPT-User, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot,
   Google-Extended, Applebot-Extended, CCBot, meta-externalagent.
3. Mettre en place une surveillance des rapports "résultats génératifs" de
   Search Console (dès qu'ils sont disponibles pour le site).

**SEA** : non-sujet avant l'existence d'un revenu — même logique que la
décision Vercel Pro (pas de dépense avant qu'il y ait quelque chose à
rentabiliser).

## SEO (2026-07-21)

URLs fantômes de l'ancien propriétaire du domaine
(`www.fidwastafid.com/*.htm`, petites annonces Algérie) encore présentes
dans l'index Google — constaté lors du lot GEO (vérification robots.txt/
redirection www). Décision : laisser mourir en 404 naturellement, vérifier
la redirection www→apex plus tard (constat fait, comportement actuel :
`http(s)://www.` redirige en 308 vers l'apex `https://fidwastafid.com/`,
correctif hors périmètre de ce lot). Aucun chantier immédiat.

## Diffusion communautaire (canaux sociaux)

Statut : chantier accepté, planifié après le 23/07.

Constat fondateur : les Marocains vivent sur WhatsApp ; les réseaux sont
le point d'entrée, le site est la destination. La communauté se
construira plus vite dans les groupes que par le trafic web direct.

Liens officiels (future source de vérité code : `config/community.ts`,
consommé par footer + bouton Diffuser ; liens publics d'invitation, pas
des secrets, constantes en clair acceptées ; toute révocation = mise à
jour de la constante unique) :
- WhatsApp : https://chat.whatsapp.com/GKxwVwHnc9b5rgxhvSXalC
- Telegram : https://t.me/+THGAhGachec2NzM0
  (@fidwastafid indisponible — lien d'invitation privé assumé en v1)
- Discord : https://discord.gg/w4dVspdmKS (invitation permanente)

Architecture décidée :
- v1 = curation manuelle : bouton « Diffuser » dans l'admin sur chaque
  deal publié. Pas de seuil de votes automatique en v1 (base de votes
  quasi nulle au lancement — la diffusion crée le volume de votes, pas
  l'inverse).
- Telegram : automatisé (Bot API officielle, `sendPhoto` + légende).
- Discord : automatisé (webhook entrant, embed image/prix/lien).
- WhatsApp : semi-manuel assumé (message formaté prêt à coller) — l'API
  officielle Meta ne poste pas dans les groupes ; libs non officielles =
  risque de ban du numéro, refusé.
- Traçabilité : table `diffusions` (`deal_id`, `canal`, `diffuse_at`) —
  anti-double-publication + historique.
- Mesure : tout lien diffusé porte
  `utm_source=whatsapp|telegram|discord&utm_medium=social&utm_campaign=diffusion`,
  lecture Vercel Analytics. Les données UTM décident de la v2.
- v2 (conditionnée aux données) : seuil automatique paramétrable,
  WhatsApp Channels si API officielle, reprise de @fidwastafid si le nom
  se libère.
- Secrets futurs (token bot Telegram, URL webhook Discord) : variables
  d'environnement uniquement.

## Taxonomie — réserve v3 (2026-07-21)

Suite à l'extension 8→12 catégories (`CONTRAT-V1` §3, cinquième amendement
conscient du 21/07/2026 : `Téléphonie & Internet`, `Gaming`, `Bricolage &
Jardin`, `Voyages`), quatre candidates supplémentaires identifiées mais
**gelées**, pas ajoutées à l'enum tant que l'usage réel ne les justifie
pas :

- Auto & Moto
- Culture & Loisirs
- Services & Abonnements
- Famille & Enfants — **gelée par décision produit** : pas sans données
  (le mapping Bringo `mapCategorie()` retombe déjà par erreur sur une
  valeur `"Enfants"` absente de l'enum sur les mots-clés bébé/enfant/jouet,
  systématiquement rejetée à la validation — cf. `validation.test.mjs`.
  Ce n'est pas un précédent : aucune catégorie enfants/famille tant que
  des données d'usage réelles ne motivent la décision).

Déblocage : uniquement piloté par les données réelles d'usage (recherche
Search Console, répartition des soumissions/deals catalogue une fois le
pipeline multi-sources actif), jamais spéculativement — même principe que
les facettes croisées et les tables ville/catégorie dédiées (CONTRAT-V1,
« Ce que ce contrat NE couvre PAS »).

## Sécurité — leaked password protection différée (2026-07-22)

Leaked password protection (vérification HaveIBeenPwned à l'inscription/
changement de mot de passe) : fonctionnalité Supabase Pro — activation
différée au passage Pro, groupé avec Vercel Pro au premier revenu (même
logique de bascule que le reste de l'infra managée, cf.
`fidwastafid-plan-v2.md`). `WARN` `auth_leaked_password_protection` assumé
d'ici là dans l'advisor Supabase — état nominal documenté au CONTRAT-V1 §9
(constat du 22/07/2026, revue sécurité mensuelle,
`docs/RUNBOOK-securite.md`), pas un oubli.
