# IDÉES — à trier après la mise en prod de la v2

*(CONTRAT-V1.md / PRINCIPES NON NÉGOCIABLES §6 : aucune feature ajoutée en cours de phase — les idées atterrissent ici, triées après la Phase 6.)*

## Dette technique temporaire

- **Diffusion — deux constats trouvés en préparant la reprise (08/08/2026),
  jamais construits, à garder en tête au premier test réel :**
  - `diffuser()` (`_lib/diffusion.ts`) écrit la ligne `diffusions` (donc
    `deja_diffuse = true`) **quel que soit le mode** — un clic « Tester »
    bloque ensuite « Diffuser » (production) sur ce canal avec un 409, EXACTEMENT
    comme un vrai envoi. Et `supprimer()` (Telegram/Discord) cible toujours la
    production (dix-septième amendement) : « Retirer » sur une diffusion de
    test échoue (message introuvable côté prod), et la ligne reste bloquée —
    aucun chemin UI pour la débloquer, seule une suppression manuelle de la
    ligne `diffusions` en base répare.
  - `diffuser()` ne filtre pas `supprime_le is null` — seul `statut = 'publie'`
    est vérifié, et la suppression douce ne touche pas `statut`. Un deal
    publié puis supprimé (doux) reste donc diffusable via un appel direct à
    la route, même si l'UI ne l'expose plus (`Publiés` exclut déjà
    `supprime_le`, `Supprimés` n'a pas de bouton Diffuser) — trou côté route,
    pas côté UI.
  - Mémoire de curation (`memoire_curation`) : aucune interférence, elle ne
    s'applique qu'à l'insertion pipeline, jamais lue par `diffusion.ts`.

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

- ~~Brancher le vote courant en SSR/API pour un état voté persistant~~ — **Fait
  le 05/08/2026** (#95, `docs/SUIVI.md` §3.5) : SSR direct sur la fiche deal et
  la page enseigne, endpoint dédié `GET /api/v1/deals/mes-votes` pour le feed
  paginé, appelé uniquement si connecté. Le retrait de vote (reclic sur la
  flèche déjà active) restait absent après ce lot — corrigé séparément (#98).

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

## Magic link et changement d'e-mail — gabarits prêts, flux non câblés (2026-08-02) — ÉCARTÉS le 08/08/2026

**Décision : ne pas construire, pour l'instant.** Le mot de passe fonctionne, aucun
besoin utilisateur ne s'est exprimé pour la connexion sans mot de passe, et le
changement d'e-mail porte un bug bloquant déjà identifié (ci-dessous) pour
environ deux jours de travail (correctif + amendement §4 + UI) — aucun des
deux ne justifie la dépense aujourd'hui. Section conservée telle quelle pour
qu'on la retrouve le jour où le besoin se présente, plutôt que de la refaire.

Les gabarits Supabase « Magic link or OTP » et « Change email address » pointent
depuis le 2026-08-02 sur `/auth/confirm` avec `token_hash` (types `magiclink` et
`email_change`), comme les deux gabarits réellement actifs — ils portaient
jusque-là `{{ .ConfirmationURL }}`, qui suppose PKCE et ne peut pas fonctionner
ici (`docs/SUIVI.md` §3.1).

**Aucun des deux flux n'est déclenché par le code.** Vérifié : `signInWithOtp`
n'apparaît nulle part dans le dépôt, et aucun parcours de changement d'e-mail
n'est exposé — `PATCH /api/v1/me` ne couvre que `pseudo` et `couleurAvatar`
(CONTRAT-V1 §4, liste fermée). Les deux gabarits sont donc **dormants** : alignés
pour ne pas casser le jour où ils partiraient, pas pour être utilisés.

**Décision différée : les câbler ou non.**

- **Magic link** — ajouterait un second chemin d'authentification à maintenir
  (et à documenter côté CNDP) pour un gain non mesuré : personne n'a demandé la
  connexion sans mot de passe.
- **Changement d'e-mail** — demande un amendement de la liste fermée §4
  (`PATCH /api/v1/me` étendu à `email`), et l'e-mail est aujourd'hui la seule
  clé d'identification du compte : le changer touche l'authentification, pas le
  profil.

**Réserve technique, si le jour vient.** `/auth/confirm` relaie le `type` reçu à
`verifyOtp` sans le restreindre, et `EmailOtpType` inclut `magiclink` et
`email_change` : les deux passent déjà, aucune route à écrire pour ça. Mais la
route exige une session en retour (`data.session`) pour poser le cookie ; si
Supabase n'en renvoie pas — cas plausible de la première des deux confirmations
d'un changement d'e-mail sécurisé — l'utilisateur atterrit sur
`/connexion?erreur=confirmation` sans explication. À traiter au câblage, pas
avant : aujourd'hui aucun e-mail n'emprunte ce chemin.

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
- ~~Qualité de `mapCategorie()` (scraper Bringo)~~ — **résolu le 08/08/2026**
  pour les prochains scrapes : le mapping lit désormais le titre du produit
  ET le rayon de l'URL de listing (jusque-là ignorés, seul `item_list_name`,
  un champ de tracking peu fiable, était lu), avec la vaisselle sans
  catégorie propre rattachée à "Maison" (décision de taxonomie explicite,
  pas une déduction). Mesuré sur les 713 deals Carrefour réels tombés dans
  "Autre" : 0 % attendu pour les prochains scrapes (rayon connu), 23,4 %
  si seul le titre est disponible (cas des deals déjà en base, où le rayon
  n'a jamais été stocké). Le stock des 713 existants n'a PAS été recatégorisé
  automatiquement — recatégoriser du déjà-publié change son apparition dans
  les filtres, une correction rétroactive attend une confirmation explicite
  et une UPDATE dédiée en production, séparée de ce lot.
  **Suite du 08/08/2026** : migration 0018 (`deals.rayon`, stocké dès
  l'insertion pour les prochains scrapes — sans ça, la prochaine amélioration
  du mapping perdrait à nouveau l'information à chaque run) + script de passe
  rétroactive `apps/pipeline/recategoriser-autre.mjs` (désarmé par défaut,
  périmètre `categorie='Autre'` + lien Bringo uniquement, réversible via
  `details.lot` en `journal_audit`) — écrit, testé, PAS encore exécuté en
  mode actif contre la production, en attente de validation du rapport à
  blanc.

## Favoris (2026-07-17)

Favoris/bookmark sur les cartes (type Dealabs) — nécessite table + endpoints
+ page mes-favoris, feature complète post-lancement.

## Page deal — profil auteur (2026-07-17)

Enrichissements profil auteur (membre depuis, nombre de deals partagés) :
dépend du futur `/membre/[pseudo]-[public_id]` réservé au contrat §2.

## Seuil de remise minimum — cadran éditorial à surveiller (2026-08-02)

**Constat d'audit** : aucun des quatre scrapers en production (bringo, inwi,
universparadiscount, decathlon) n'appliquait de seuil de remise. La seule règle
de prix était la **cohérence** (`prix_normal >= prix_promo`) et la **présence**
des deux prix — jamais l'**ampleur**. Un produit à −2 % entrait dans la file
exactement comme un produit à −70 %. Ce n'était donc pas un défaut d'une
source, mais un manque générique : le pipeline savait dire « c'est bien une
promotion », jamais « c'est bien une bonne affaire ».

Corrigé le 02/08/2026 : `apps/pipeline/remise.mjs`, seuil unique appliqué dans
`insert-deals.mjs` — le seul point de passage commun à toutes les sources.

**Effet mesuré du seuil à 30 %** sur les extractions réelles du jour :

| Source | Extraits | Retenus à 30 % | Rejetés | Médiane de remise |
|---|---|---|---|---|
| kiabi | 120 | **110** | 10 | 50 % |
| decathlon | 118 | **66** | 52 | 30 % |
| universparadiscount | 80 | **57** | 23 | 33 % |
| inwi | 6 | **3** | 3 | 34 % |
| bestmark | 1 | **0** | 1 | 16 % |

**À surveiller, et c'est le motif de cette entrée** : 30 % n'est pas une valeur
neutre. Decathlon perd ~44 % de son volume, inwi la moitié, et Bestmark tombe à
zéro — la source ne produit alors plus rien du tout. Le chiffre se relit dans
`remise.mjs` avant d'être bougé ; le bouger change ce que le site montre.

**Décision du 02/08/2026 — le seuil est UNIFORME, et c'est délibéré.** La
question posée était : fallait-il calibrer le seuil par enseigne, pour ne pas
amputer Decathlon de 44 % de son volume ni tuer Bestmark ? Réponse : non.

- **Un seul point de passage.** Un seuil par source, c'est six valeurs à
  entretenir, six occasions de dériver, et la question « pourquoi 22 % ici et
  30 % là ? » sans réponse écrite six mois plus tard. C'est le raisonnement qui
  a déjà fait remonter la validation zod dans `packages/schemas` et l'alerte
  d'échec dans une action partagée : une règle qui vit en plusieurs exemplaires
  finit par ne plus être la même règle.
- **Une promesse utilisateur cohérente.** Le seuil n'est pas un réglage
  d'ingestion, c'est ce que « bon plan » veut dire sur ce site. Le calibrer par
  enseigne reviendrait à dire au visiteur qu'une remise vaut d'être montrée
  selon le vendeur, pas selon ce qu'elle lui fait économiser. Un deal Decathlon
  à −22 % et un deal Kiabi à −22 % doivent recevoir la même réponse.
- **Le volume n'est pas un argument de qualité.** Amputer Decathlon de 52 deals
  est un effet, pas un dommage : ces 52 deals étaient sous la barre. Et la
  chute de Bestmark à zéro n'est pas causée par le seuil — son unique remise du
  catalogue vaut 16 %. Le seuil ne fait que rendre visible ce que la source
  vaut réellement.

Ce qui reste ouvert, et se décide sur le chiffre, jamais par enseigne : la
valeur elle-même. La bouger de 30 à 25 ou à 40 est une décision produit ; la
remplacer par six valeurs n'en est pas une.

**Ce que le seuil ne fait PAS** : il ne borne pas le volume. Sur le run Kiabi
non capé, **505 des 556 deals passent les 30 %** (médiane 50 %) — les promotions
de Kiabi sont profondes et permanentes. Le cap de 120/run du scraper reste donc
nécessaire et n'est pas remplaçable par le seuil : l'un filtre la qualité,
l'autre borne la file admin. Les confondre remettrait ~505 fiches par run à
trancher à la main.

## Diversification des sources — exception assumée pour Kiabi et Bestmark (2026-08-02)

Le séquencement posé ci-dessous (« un par un, post-Phase 7 ») **n'a pas été suivi**
pour `kiabi.ma` et `bestmark.ma`, traités ensemble dans un même lot. C'est une
exception consciente, pas un oubli du cadre.

**Motif** : ces deux sources sont une **extension pure du pattern existant** —
un adaptateur `.mjs` de plus, la même sortie normalisée, la même validation zod
partagée, la même étape de workflow copiée sur celle de Decathlon. Aucune
architecture nouvelle, aucune dépendance ajoutée, aucun rendu JS, et surtout
**aucun contournement d'anti-bot** : les deux exposent une API publique et
documentée (Shopify `products.json` pour Kiabi, GraphQL Magento pour Bestmark).
Ce que le séquencement « un par un » protège, c'est le coût de découverte d'une
source inconnue ; ici ce coût est nul, il n'y avait rien à protéger.

**Ce qui reste hors périmètre, inchangé** :
- **Zara** — aucune action prise. Le pipeline n'a **aucune politique écrite sur
  les sources à ToS restrictif** ; tant qu'elle n'existe pas, l'ajouter serait
  trancher seul une question de gouvernance. Décision à prendre explicitement.
- **Electroplanet** — exclu deux fois plutôt qu'une : mur Cloudflare sur le
  domaine entier (spike du 22/07), et surtout `robots.txt` en
  `User-agent: * / Disallow: /` (vérifié le 02/08/2026, après redirection vers
  `www`). Interdiction totale : le sujet est clos, pas reporté.

**Rendement mesuré au premier run**, à connaître avant d'en attendre quoi que ce soit :
Kiabi ~45 % du catalogue remisé en permanence (556 deals sur 1250 produits — d'où
un cap volontaire à 120/run) ; Bestmark **1 seul produit remisé sur 865**. La
seconde ne se justifiera que si l'enseigne ouvre de vraies opérations
commerciales — si elle reste à zéro sur la durée, la retirer est une décision à
prendre, pas une panne à diagnostiquer.

## Catégorisation dynamique par rayon — écartée pour decathlon/kiabi/universparadiscount (2026-08-12)

Chiffrée (pas codée) sur demande explicite avant de lancer quoi que ce soit :
étendre le mécanisme de Bringo (`mapCategorie()`/`rayonDepuisUrl()`,
`_lib/categoriser.mjs`) à ces trois sources pour diversifier au-delà de leur
catégorie fixe actuelle (Sport/Mode/Beauté).

**Constat qui ferme le sujet, pas seulement le coût** : les trois catalogues
sont **mono-domaine**. Un magasin de sport vend du sport, une enseigne de
mode vend de la mode, une para-pharmacie vend de la beauté — la catégorie
fixe actuelle est déjà juste pour l'essentiel du catalogue de chacune. Un
rayon plus fin diversifierait les LIBELLÉS internes (« crèmes solaires »,
« rouge à lèvres »…), pas la CATÉGORIE canonique de destination (les 12 de
`packages/schemas`) — la quasi-totalité resterait de toute façon dans le
même bucket qu'aujourd'hui.

- **UniversParaDiscount** : rayon déjà présent dans le lien produit scrapé
  (≥20 segments observés sur un run), coût faible (~0,5 j, mapping seul) —
  mais gain quasi nul, tout reste « Beauté ».
- **Kiabi** : `product_type`/`tags` Shopify potentiellement exploitables,
  jamais vérifiés — mais même conclusion attendue, tout reste « Mode ».
- **Decathlon** : aucune donnée rayon sur les pages déjà scrapées (ni
  breadcrumb, ni URL par catégorie) — coût élevé (~1-2 j, nouvelle requête
  par fiche ou nouvelles URLs de rayon) pour un gain quasi nul, tout reste
  « Sport ».

**Conclusion** : pas de lot. La diversification du catalogue passe par de
nouvelles sources (domaines différents), pas par un rayon plus fin sur des
sources déjà mono-domaine — ne pas reposer la question sans un fait nouveau
(ex. une de ces enseignes élargit réellement son offre hors de son domaine).

## Bestmark — retrait du cron (2026-08-13)

**Retiré de `pipeline-quotidien.yml`, pas supprimé du dépôt.** Le script
(`scraper-bestmark.mjs`) reste exécutable à la main ; simplement plus appelé
automatiquement chaque jour.

**Motif — deux constats indépendants, chacun suffisant seul :**

- **Blocage réseau depuis les runners GitHub, pas une politique déclarée.**
  `fetch failed` (échec TCP/TLS, jamais un statut HTTP) sur au moins dix runs
  consécutifs (`pipeline-quotidien.yml`, commentaire du 12/08). Vérifié le
  13/08/2026 depuis un réseau tiers : le site répond normalement (200,
  contenu e-commerce complet), et son `robots.txt` ne nomme aucun bot IA —
  contrairement à marwa.com/iam.ma (`Disallow: ClaudeBot` explicite), ce
  n'est pas un refus délibéré à respecter, mais une plage d'IP bloquée qu'on
  ne peut pas réparer sans changer d'infrastructure d'exécution (hors
  périmètre).
- **Rendement déjà quasi nul, indépendamment du blocage** : 1 seul produit
  remisé sur 865 mesurés (`SPIKE-SOURCES.md`, 02/08/2026). Même joignable à
  100 %, la source ne justifierait pas sa place dans le cron quotidien.

**Ne pas réintroduire sans fait nouveau** : soit le blocage réseau se lève
de lui-même (à revérifier ponctuellement, pas activement surveillé), soit
Bestmark ouvre de vraies opérations commerciales qui changeraient le
rendement — l'un des deux, pas une réintroduction par habitude.

## Decathlon — seuil de retrait posé, pas une surveillance indéfinie (2026-08-13)

**`HTTP 403` sur `/5080-promotions` depuis le 11/08/2026** (le 10/08 fonctionnait
encore, 24 offres extraites) — 3 jours consécutifs au moment de ce constat.
Contrairement à Bestmark : `robots.txt` inchangé et permissif (aucun bot IA
nommé, aucune restriction nouvelle sur les pages promo/catégorie), site
normal et catalogue complet (1415 produits, promos jusqu'à -70 %) vérifié
depuis un réseau tiers le 13/08. Pas un refus déclaré — une détection
anti-bot probable côté runners GitHub, qui a évolué du simple marquage
(`x-bot: YES`, sans blocage, constaté au spike du 22/07) vers un vrai 403.

**Différence avec Bestmark qui justifie de garder la source active pour
l'instant** : Decathlon produit réellement (62 `auto_draft` en attente + 22
`publie`, mesuré en base le 13/08/2026) — perdre une source qui rapporte
coûte plus cher que manquer une candidate qui ne rapportait déjà presque
rien.

**Seuil de retrait posé aujourd'hui, pour ne pas surveiller indéfiniment** :
si le `403` persiste **14 jours consécutifs** (au-delà du 27/08/2026), retirer
`scraper-decathlon` du cron exactement comme Bestmark (même geste : retrait de
`pipeline-quotidien.yml`, script conservé, entrée dans ce fichier). Une source
qui échoue sans limite finit par devenir un `::warning::` qu'on ne lit plus.

**Vérifié le 13/08/2026 — la supervision existante couvre déjà ce cas, sans
changement de code nécessaire** :
- Un `HTTP 403` fait échouer `scraper-decathlon.mjs` (`throw new Error`) AVANT
  la ligne `→ Archive : ...` ; le workflow le classe donc comme n'importe quel
  échec réseau, cause **`injoignable`** (`packages/db/migrations/0020`) — pas
  une catégorie à part, pas un angle mort de `verifier-sources-mortes.mjs`.
- Le seuil d'alerte de cette cause est **2** runs consécutifs
  (`verifier-sources-mortes.mjs`, `SEUILS.injoignable`) — bien en dessous des
  14 jours ci-dessus. **Nuance mesurée** : `pipeline_runs` (migration 0020)
  n'existe que depuis le 12-13/08/2026, le run du 13/08 est le PREMIER
  qu'elle enregistre pour `decathlon` (série affichée : 1, pas 3 — les échecs
  du 11 et 12/08 sont réels, vus dans les logs GitHub Actions, mais
  antérieurs à la table). L'alerte GitHub (`alerte-source-decathlon`) partira
  donc au run suivant si le 403 persiste (série = 2 dans `pipeline_runs`),
  pas immédiatement — elle sert de rappel régulier avant le seuil de 14 jours
  ci-dessus, qui reste la décision de retrait.

## Voyages — catégorie vide, réexamen posé à échéance (2026-08-13)

**0 deal `categorie = 'Voyages'` en base**, sur les 3 semaines écoulées depuis
l'ajout de la catégorie (5ème amendement conscient, 21/07/2026, CONTRAT-V1
§3) — vérifié en lecture seule le 13/08/2026. Aucune source pipeline
scrapable identifiée : `royalairmaroc.com` (`SPIKE-SOURCES.md`) n'a pas de
prix barré, seulement des tarifs « à partir de X » ; recherche web du
13/08/2026 : le reste du secteur est soit des OTA internationales ciblant
les vols *vers* le Maroc (pas un public résident), soit des agences locales
sans page de promo structurée. Le modèle « deal » (prix normal vs promo) ne
s'applique structurellement pas à ce secteur — pas un chantier différé faute
de temps, un constat.

**Décision : l'enum reste ouverte aux soumissions humaines** (`/soumettre`),
pas retirée. Retirer la valeur nécessiterait de la re-décider plus tard sans
gagner rien aujourd'hui (aucune migration à défaire, c'est un enum zod pur —
`packages/schemas`) ; la garder permet à tout instant qu'un utilisateur
soumette un vrai bon plan voyage (ex. capture d'écran d'une offre trouvée
ailleurs) sans qu'un nouvel amendement soit nécessaire pour la réouvrir.

**Départ du compte, écrit pour ne pas reposer la question sans mémoire** :
si `categorie = 'Voyages'` compte toujours **0 deal** (soumission humaine
comprise, pas seulement pipeline) au **13/11/2026** (90 jours après ce
constat), rouvrir la question du retrait de l'enum — la fenêtre est jugée
suffisante pour qu'une soumission humaine spontanée survienne si la demande
existe réellement, sans être assez longue pour laisser la question dériver
indéfiniment.

## Gaming — spike réel avant tout code (2026-08-13)

Candidats identifiés (recherche web, aucun n'avait été évalué dans
`SPIKE-SOURCES.md`) : zonetech.ma, mediazone.ma, marjanemall.ma,
mgamesstore.com, boutika.co.ma, setupgame.ma, **gamezone.ma**, playstore.ma.

**gamezone.ma (PrestaShop, même plateforme que decathlon/universparadiscount)
— pas le gain espéré.** `robots.txt` permissif (aucun `Disallow` pertinent,
aucun bot IA nommé), mais la page d'accueil est un **coquille vide côté
données** : 14 `href` seulement dans le HTML brut (assets + connexion), zéro
lien catégorie, zéro marqueur de prix — la grille produit est chargée par des
modules PrestaShop custom (`gz_hometab`, `gz_homesearch`) en AJAX après coup.
Pas de `sitemap.xml` (404) pour contourner par découverte. Testé avec Node
`fetch` (le client réellement utilisé en prod, pas `curl` — leçon
mrbricolage), depuis ce réseau, pas depuis un runner GitHub. Verdict :
**pas cheerio-compatible en l'état** — nécessiterait de retrouver l'endpoint
AJAX interne (non fait, hors budget de ce spike) ou un rendu JS (écarté par
principe, cf. electroplanet).

**Piste de repli trouvée en cours de route : mgamesstore.com**
(`/product-category/jeux-video/promotion/`) — WooCommerce, `robots.txt`
permissif, **28 résultats** sur la page promo dédiée, vrais prix barrés
WooCommerce standard (`<del>`/`<ins>`), 200 en Node `fetch`, aucun challenge
Cloudflare rencontré (contrairement à mrbricolage, même plateforme). Non
développé — un seul test, à spiker plus complètement (volume réel,
pagination, stabilité) avant tout code. Meilleur candidat Gaming actuel,
au-dessus de gamezone.ma.

## Diversification des sources (2026-07-18) — partiellement caduque

**« Le pipeline ne scrape que Bringo » n'est plus vrai** : six sources tournent
en production (bringo, inwi, universparadiscount, decathlon, kiabi, bestmark —
voir l'entrée du 02/08/2026 ci-dessous pour les deux dernières). Ce qui reste
un chantier réel, non repris ailleurs : **Marjane**, déjà exploré via
`discover-site.mjs` (capture des appels API + rendu HTML, début juillet) sans
suite donnée, et Carrefour direct hors Bringo — chantier de découverte +
adaptation par source, un par un.

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

## Purge automatique des `expire` jamais publiés — différée, faute de mesure (2026-08-05)

Le lot 5 du plan « suppression administrative des deals » (`apps/pipeline/purger-lignes.mjs`,
CONTRAT-V1 §1/§3, quatorzième amendement) exclut explicitement les deals `expire` de son périmètre
automatique — CONTRAT-V1 **§1** grave « URL vivante à vie, jamais de suppression » pour un deal
expiré, un actif SEO. Cette exclusion couvre aujourd'hui les **681** `expire` jamais publiés (« purgeables »
au sens du lot 3, `deals_protection.protege = false` — 430 le 05/08/2026, remesuré à 681 le 12/08/2026,
le pipeline a continué de tourner) sans distinction : traités comme un bloc protégé, qu'ils aient ou non
une valeur SEO réelle.

**Ce n'est pas tranché, c'est différé faute de mesure.** L'argument SEO suppose que ces pages sont
effectivement indexées et rapportent du trafic — rien ne le vérifie aujourd'hui. Avant d'envisager une
purge automatique de ce sous-ensemble (jamais publié, donc jamais mis en avant, contrairement à un
`publie` rétrogradé) :

- Mesurer leur présence réelle dans l'index Google (Search Console : pages indexées, impressions,
  clics) — un `expire` jamais publié n'a peut-être jamais été crawlé ni indexé du tout, auquel cas
  l'argument SEO ne s'applique pas à lui et l'exclusion serait plus prudente que nécessaire.
- Si la mesure montre une part significative sans trafic ni indexation : rouvrir la question d'un
  périmètre lot 5 élargi, avec un seuil de dormance propre, pas une simple suppression de
  l'exclusion actuelle.
- Si la mesure montre une indexation/un trafic réels même sur du jamais-publié : l'exclusion actuelle
  reste la bonne décision, sans plus de débat.

Déblocage : uniquement piloté par la mesure Search Console, jamais spéculativement — même principe que
la taxonomie v3 et les facettes croisées ci-dessus.

**Suite du 12/08/2026 — ces 681 pages sont sorties du sitemap** (`apps/web/src/app/sitemap.xml/route.ts` :
seuls `publie` et `expire` avec `deals_protection.protege = true` y figurent désormais ; mesuré avant
écriture, lecture seule production : 681 `expire` protégés = 0). Elles restent cependant en **200**
aujourd'hui — aucune trace de diffusion pour aucune des 681 (`protege = false` couvre ce cas), donc
aucun lien externe déjà partagé connu, mais rien ne garantit une absence totale (un `public_id` deviné
ou une capture d'écran partagée resteraient possibles, juste extrêmement improbables — nanoid 10
caractères).

Options pour leur statut HTTP, décision à prendre séparément (aucune construite) :

| Option | Coût | Conséquence |
|---|---|---|
| **A — statu quo** (200, juste hors sitemap, déjà l'état après ce lot) | Nul | Réversible à 100 %. Mais Google peut encore les (re)découvrir hors sitemap (exploration profonde, lien externe hypothétique) et les indexer par accident — ne règle le problème qu'à moitié. |
| **B — `noindex` explicite** sur ces pages précises (condition déjà disponible : `statut='expire' && !protege`, dans `generateMetadata` de la fiche deal) | Faible — quelques lignes, pas de migration | Page reste 200, un lien déjà partagé continue de fonctionner à l'identique, mais dit explicitement à Google de ne pas indexer — désindexe aussi les 22 pages déjà dans l'index si certaines en font partie. Le signal le plus honnête : « ceci n'est pas un actif ». |
| **C — page d'archive dédiée** listant ces deals à part | Élevé — nouvelle route, UX à concevoir, risque de confusion (« pourquoi ce deal n'a jamais été validé ? ») | Recrée un chemin interne, mais vers du contenu jamais modéré — tension avec l'objectif même de ce lot (qualité perçue). |
| **D — 410 Gone** au lieu de 200 | Moyen — modifie la résolution de la fiche deal pour ce cas précis | Signal le plus fort, Google purge plus vite qu'un simple 404. Seule option qui casse un lien déjà partagé s'il en existait un — irréversible côté UX (les données restent en base, la page non). |

## Identité juridique du responsable de traitement — en pause, structure prête (2026-08-05)

`/confidentialite` porte toujours un repère explicite : l'identité juridique du responsable de
traitement (raison sociale, forme juridique, adresse, contact dédié à l'exercice des droits) n'est
pas publiée. **En pause** — Kamel n'a pas ces informations à fournir à court terme, ce n'est pas
oublié, c'est délibérément différé.

**Ne pas repartir de zéro le jour venu** : une structure d'accueil existe déjà, construite et
vérifiée (typecheck, lint), sur la branche `feat/identite-responsable-traitement` (PR #96, fermée
sans fusion). `apps/web/src/app/confidentialite/page.tsx` y porte une constante
`RESPONSABLE_TRAITEMENT` avec cinq champs, chacun documenté :

1. **Raison sociale** — nom légal exact (entité ou personne physique si nom propre/auto-entrepreneur).
2. **Forme juridique** — SARL, SARL AU, auto-entrepreneur, personne physique…
3. **Adresse** — adresse postale complète du siège ou de l'exploitant.
4. **Contact dédié à l'exercice des droits** — un e-mail (`contact@fidwastafid.com` suffit-il, ou un
   canal distinct ?).
5. **RC/ICE, si applicable** — registre de commerce (numéro + ville) et Identifiant Commun de
   l'Entreprise, usuels dans une mention légale marocaine complète mais pas obligatoires en soi ;
   champ optionnel, n'affiche rien tant qu'il n'est pas confirmé applicable.

Tant qu'un champ obligatoire n'est pas fourni, la page l'affiche littéralement `à compléter` —
visible, jamais masqué ni inventé. Fournir les valeurs et rouvrir la branche (ou en recréer une à
partir d'elle) suffit à publier ; aucune autre partie du fichier n'a besoin de changer.

**Distinction à ne pas perdre** : cette mention est **indépendante d'une éventuelle déclaration
CNDP** (retirée du dépôt le 04/08/2026 faute de preuve qu'elle ait eu lieu, `docs/INCIDENTS.md`).
L'identité du responsable de traitement est due dès lors que des données sont collectées — ce qui
est déjà le cas aujourd'hui (compte, votes, commentaires) — que le site soit ou non déclaré à la
CNDP par ailleurs. Retarder l'une ne retarde pas l'obligation de l'autre.

Déblocage : Kamel fournit les cinq informations ci-dessus, quand il le décide — aucune mesure ni
condition technique à remplir avant.
