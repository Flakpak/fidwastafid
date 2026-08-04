# INCIDENTS — fidwastafid

*Journal des incidents de production et d'infrastructure. **Ordre antichronologique** :
l'entrée la plus récente en tête. Une entrée se lit seule — symptôme, diagnostic, cause,
correctif, leçon — sans exiger d'avoir suivi la conversation d'origine.*

*Ce fichier n'est pas un `CHANGELOG` : on n'y consigne que ce qui a **cassé**, et ce qu'on
en a appris. Une leçon gravée ici a vocation à être citée depuis le code ou la CI, comme
`ci.yml` cite déjà celle du 19/07/2026.*

---

## 2026-08-04 — Une soumission `en_attente` existait en base, invisible dans le back-office

*(Consigné ici le 2026-08-05, après diagnostic.)*

**Symptôme.** Un deal soumis via `/soumettre` (lien `marwa.com`) affiche le message de
succès, mais n'apparaît nulle part dans la file de modération admin.

**Diagnostic — la ligne existe, correctement.** Deux soumissions en base (l'utilisateur a
réessayé) : `statut=en_attente`, `type=en_ligne`, `enseigne_id` `NULL` (marwa.com non
curée — légitime), `submitter_id` résout sur le bon compte, `turnstile_verifie=true`.
L'écriture (`POST /api/v1/deals`) a fonctionné du premier coup ; aucun `catch` n'avale
d'erreur, aucune transaction n'est restée en suspens.

**Cause.** `GET /api/v1/admin/deals` n'avait pas de filtre par défaut mais un `LIMIT 1000`
sur TOUS statuts confondus, trié `auto_draft` d'abord puis `score desc, public_id desc` —
le filtrage et le tri PAR ONGLET se faisaient ensuite côté client, sur ce tableau déjà
tronqué. La table comptait 1592 lignes (646 `auto_draft` + 946 autres). Parmi les 946,
938 étaient à égalité de score `0`, départagées par `public_id` — une chaîne aléatoire,
pas `created_at`. Seules 354 places restaient après les `auto_draft` : les deux nouvelles
soumissions, à égalité avec 627 et 478 autres lignes respectivement selon ce critère
arbitraire, tombaient hors du `LIMIT`, silencieusement. Ni un filtre, ni une jointure
(toutes en `LEFT JOIN`) n'étaient en cause — hypothèses initiales écartées par la mesure.

**Aggravant.** Les compteurs par onglet du back-office (« En attente (0) ») étaient
calculés sur ce même tableau tronqué : l'interface affirmait activement une absence
FAUSSE plutôt que de ne rien afficher — la même famille de défaut que le repli silencieux
déjà consigné trois fois ici (19/07, 24/07, 02/08).

**Correctif (CONTRAT-V1 §4, neuvième amendement conscient, 05/08/2026).**
`GET /api/v1/admin/deals` filtre désormais PAR STATUT en base (paramètre requis),
paginé par curseur comme le feed public — jamais de `LIMIT` global. `en_attente` trie par
`created_at` croissant (plus ancien d'abord : une file d'attente se traite dans l'ordre
d'arrivée, pas par classement). Les comptes par onglet viennent d'un nouvel endpoint,
`GET /api/v1/admin/deals/compte` — un `count(*)` en base par statut, jamais la longueur
d'une liste paginée.

**Leçon.** Un filtre appliqué APRÈS avoir chargé une liste tronquée n'est pas un filtre :
c'est un tri sur ce qui a survécu au hasard de la troncature. Une file de modération doit
filtrer avant de trier, et compter en base.

---

## 2026-08-04 — Mention CNDP retirée : aucune déclaration n'est attestée dans le dépôt

*Entrée de **constat**, pas d'incident : rien n'a cassé en production. Consignée pour
que la mention ne revienne pas sans preuve — même logique que l'entrée du 2026-08-02
ci-dessous, qui grave une contrainte plutôt qu'une panne.*

**Le fait.** Le pied des deux gabarits e-mail actifs (`docs/runbooks/emails-tadelakt.md`)
et deux maquettes de référence (`docs/maquettes/tadelakt-site-complet.html`,
`docs/maquettes/fidwastafid-planche-marque.html`) affirmaient « Traitement déclaré
auprès de la CNDP (loi 09-08) » / « Déclaré auprès de la CNDP ». Recherche exhaustive du
dépôt (`git grep -i cndp`) : aucun numéro, aucune date, aucune preuve d'une déclaration
réelle n'existe nulle part — seule la mention elle-même, recopiée d'un fichier à
l'autre. `docs/CONTRAT-V1.md` §3 dit l'inverse depuis Phase 1 : la collecte à fin de
revente « nécessite généralement consentement explicite + déclaration, à vérifier avant
la bascule prod » — jamais vérifiée, jamais faite. Le site en production
(`/confidentialite`, pied de page) ne portait déjà aucune mention CNDP ; le risque
tenait aux gabarits e-mail, non encore collés dans Supabase, et aux maquettes de
référence.

**Correctif.** La mention est retirée des trois fichiers, sans remplacement : une page
qui n'affirme rien n'est pas fausse ; une page qui affirme une déclaration inexistante
l'est.

**Règle.** Cette mention ne se rétablit que sur présentation d'un numéro de déclaration
CNDP et d'une date — jamais recopiée par confiance depuis un fichier existant.

---

## 2026-08-02 — Contrainte : `/auth/confirm` exige une session, un changement d'e-mail sécurisé n'en produit pas toujours

*Entrée de **contrainte**, pas d'incident : rien n'a cassé en production. Le défaut est
latent parce qu'aucun e-mail n'emprunte ce chemin aujourd'hui. Il est consigné ici pour
être lu le jour où il cesserait de l'être — pas après.*

**Le fait.** `apps/web/src/app/auth/confirm/route.ts` ne pose le cookie de session que si
`verifyOtp` renvoie **à la fois** `!error` **et** `data.session`. À défaut, la route
redirige vers `/connexion?erreur=confirmation` — exactement le même message que pour un
jeton invalide, expiré ou déjà consommé.

**Pourquoi c'est un piège pour `type=email_change`.** Un changement d'e-mail sécurisé se
valide en **deux** confirmations chez Supabase (ancienne adresse, puis nouvelle). La
première n'ouvre pas de session : le changement n'est pas encore effectif. La route la
lirait donc comme un échec et enverrait l'utilisateur sur une page d'erreur alors que son
clic a réussi — et il n'aurait aucune raison de cliquer sur le second lien.

C'est la **troisième occurrence du même motif**, après le 19/07 et le 24/07 :

> **Une valeur de retour ambiguë n'est pas un type de retour acceptable.**

Ici, « pas de session » signifie tantôt « jeton refusé », tantôt « étape 1 sur 2
franchie ». Le code ne peut pas les distinguer, donc il choisit le mauvais des deux.

**Contrainte, à tenir avant tout câblage réel du changement d'e-mail.** `/auth/confirm`
doit d'abord séparer les deux sorties : `error` (échec) et « succès sans session » (étape
intermédiaire, qui appelle un message d'attente, pas une erreur). La décision de câbler ou
non ce flux reste ouverte — voir `docs/IDEES.md`.

**Portée — ce qui n'est PAS concerné.** Les deux flux actifs sont hors de cause :
`type=email` (inscription) et `type=recovery` (réinitialisation) renvoient une session en
cas de succès et tournent en production. Le gabarit `email_change` pointe sur cette route
depuis le 2026-08-02, mais aucun code ne le déclenche.

---

## 2026-07-27 — Rotation du mot de passe Postgres à 2 détenteurs sur 3 : le backup tombe, personne n'est prévenu

*(Consigné ici le 2026-08-02. Le détail opératoire et la liste de contrôle de rotation
vivent dans [`docs/RUNBOOK-securite.md:212`](RUNBOOK-securite.md) — cette entrée grave la
contrainte permanente, pas la procédure.)*

**Symptôme.** Le backup quotidien du 27/07 échoue : `password authentication failed`
(`28P01`). **Aucune alerte.** L'échec est découvert le lendemain matin par un audit
manuel — après une journée entière sans backup vérifié, sur une base dont c'est la seule
protection.

**Cause.** Le mot de passe du rôle `postgres` a été tourné dans la nuit du 26 au 27/07
(~00:22 UTC), juste avant la migration 0010. **Deux détenteurs sur trois** ont été mis à
jour ; le troisième est resté sur l'ancienne valeur.

**Les trois détenteurs — l'inventaire est la contrainte.**

| # | Détenteur | Consommateurs | Port | Ce que casse un oubli |
|---|---|---|---|---|
| 1 | **Vercel** → `fidwastafid-prod` → `DATABASE_URL` (Production **et** Preview) | l'app web | 6543 | site entier en 500 — la seule panne qu'un visiteur voit |
| 2 | **GitHub** → secret Actions `SUPABASE_DB_URL` | `db-backup.yml` **et** `pipeline-quotidien.yml` | 5432 | backup **et** scraping/expiration — deux pannes, pas une |
| 3 | **Local** → `packages/db/.env.migration.local` (jamais commité) | `migrate`, `seed`, `ajouter-enseigne` | 5432 | plus aucune migration ni script de données |

Le détenteur oublié le 27/07 était le **n° 2**. Une variable Vercel ne prend effet qu'au
déploiement suivant, et le secret GitHub n'est lu que par des crons : deux des trois
détenteurs ne se manifestent donc pas au moment de la rotation. **`CI_MIGRATIONS_CHECK_URL`
n'est pas dans cette liste** — il porte le mot de passe du rôle `ci_migrations_check`,
pas celui de `postgres`.

**Contraintes permanentes gravées par cet incident.**

- **Une rotation n'est terminée que quand les trois détenteurs sont à jour ET vérifiés par
  une exécution réelle.** Deux sur trois n'est pas une rotation, c'est une panne différée.
- **Un secret partagé par deux workflows compte pour deux systèmes.** `SUPABASE_DB_URL`
  alimente le backup et le pipeline ; les compter pour un est l'erreur exacte du 27/07.
- **Un garde-fou muet n'est pas un garde-fou.** GitHub n'envoie d'e-mail d'échec qu'à
  l'auteur du commit déclencheur — **un run de cron n'en a pas**, donc un cron qui casse
  ne prévient personne par défaut. Correctif du jour : `db-backup.yml` ouvre une issue
  (label `alerte-backup`). Complété le 2026-08-02 : l'issue est **assignée** et porte le
  label `urgent`, parce qu'une issue ouverte sans assigné ne déclenche aucune
  notification — elle attend d'être trouvée, ce qui est précisément ce qui a échoué ici.

---

## 2026-07-27 — Plus aucun déploiement Vercel : deux installations qui ne résolvent pas les mêmes types

**Symptôme.** À partir de `356edd7` (décommissionnement du scaffold v1),
**aucun déploiement Vercel n'aboutit** — ni production, ni préversion. La
production continue de servir le dernier déploiement sain (`2bf406d`) : rien ne
tombe côté visiteur, mais **plus rien ne peut être livré**. Trois PR fusionnées
dans cet intervalle sont déployées « sur le papier » seulement.

```
./src/app/mot-de-passe-oublie/page.tsx:41:15
Type error: Property 'src' does not exist on type 'IntrinsicAttributes & ScriptProps'.
```

**Diagnostic.** L'erreur est **identique sur trois branches et trois lockfiles
différents** (main, une PR de code, une PR dependabot) : ce n'est donc ni un
cache de build ni un hasard de résolution. Le commit fautif retire
`@types/react` et `@types/react-dom` du `package.json` **racine**, au motif
qu'elles servaient le prototype v1. C'était vrai — et insuffisant : elles
étaient **en plus porteuses** de la résolution de types pour tout le workspace.

**Cause.** Vercel construit avec **Root Directory = `apps/web`**. Cet arbre
d'installation ne résout pas les types comme une installation depuis la racine
du workspace : avec la déclaration racine, une seule copie de `@types/react` est
visible de tout le monde, `next/script` comprise ; sans elle, le `ScriptProps`
de next se résout contre une autre copie et perd ses props.

**Pourquoi la CI ne l'a pas vu** — et c'est le vrai sujet :

| Vérification | Installe depuis | Verdict |
|---|---|---|
| `pnpm typecheck` en local | racine du workspace | vert |
| job `docker` (Dockerfile, contexte `.`) | racine du workspace | vert |
| **Vercel** | **`apps/web`** | **rouge** |

Les deux garde-fous les plus stricts du dépôt étaient verts. Le seul build qui
installe comme la production est celui de Vercel, et son verdict figure bien
dans les checks de PR sous le nom `Vercel` : **il était rouge sur #44, il a été
imprimé dans la sortie de la commande de fusion, et fusionné sans être lu.**

**Correctif.** `dae392f` — les deux paquets rendus au `package.json` racine.
Prouvé par le déploiement de préversion de la PR (le seul artefact qui prouve
quoi que ce soit ici), puis par le déploiement de production `READY`.

**Correction du diagnostic (même jour, après contre-épreuve).** L'explication
« la racine d'installation diffère » ci-dessus **n'est pas confirmée**. Un job CI
a été écrit pour la vérifier (`build-vercel` : `pnpm install --frozen-lockfile`
puis `pnpm run build`, depuis `apps/web`), puis soumis à la régression réelle —
les deux `@types` retirés de la racine, poussés sur une branche. Résultat :
**le job est resté vert pendant que le déploiement Vercel de la même branche
échouait.**

Ce que cette contre-épreuve établit : une installation **propre** depuis
`apps/web` résout correctement les types, même sans les déclarations racine. La
différence restante avec Vercel n'est donc pas la racine d'installation, mais
très probablement son **cache de build réutilisé** et son installation en delta
— le log de la préversion fautive montre « Restored build cache from previous
deployment » puis un install qui **retire 10 paquets** au lieu de reconstruire.
L'argument « trois lockfiles différents, donc pas le cache » était trop rapide :
les trois déploiements restauraient un cache issu de la **même** lignée
antérieure à la suppression.

Le correctif reste juste (la déclaration racine referme le cas), mais **la cause
exacte reste ouverte**. Ce qui ne l'est pas : le seul verdict fiable est celui
de Vercel lui-même.

**Décision sur le garde-fou (27/07/2026) — le job CI est abandonné.** Le job
`build-vercel` écrit pour couvrir ce chemin ne l'a pas couvert : la contre-épreuve
ci-dessus le montre vert sur la régression réelle. Deux options se présentaient —
le rendre fidèle en reproduisant le cache de Vercel, ou l'abandonner. **La
première est écartée** : le cache de Vercel est son artefact interne (contenu,
clé et politique d'invalidation non documentés), un `actions/cache` sur
`node_modules` n'en serait qu'une imitation, et un garde-fou qui imite le mauvais
mécanisme est pire que pas de garde-fou — il coûte une minute à chaque PR et
rassure à tort. Le job est donc supprimé (PR fermée sans fusion).

> **Sur ce chemin, le check `Vercel` est le seul garde-fou réel.** Il est
> bloquant depuis le 27/07 (protection de branche), au même titre que `quality`,
> `docker` et `openapi-check` — et il ne peut pas être contourné, `enforce_admins`
> compris. Aucune vérification locale ni CI ne le remplace : elle ne construit
> pas dans l'environnement qui sert la production.

**Levier de désactivation du cache, si la cause devait être tranchée** (relevé
dans la documentation Vercel, non appliqué) : il n'existe **pas** de réglage de
projet « toujours sans cache ». Les deux mécanismes documentés sont
**par déploiement** — `vercel deploy --force` (CLI) et un Deploy Hook appelé avec
`?buildCache=false`. Les rendre systématiques en production supposerait de
remplacer l'intégration Git par un déclenchement piloté (Action GitHub appelant
le hook), c'est-à-dire de changer la façon dont la production est livrée. Coût
mesuré du cache : build de production **67 s** avec cache (déploiement
`a6e8d3b`) ; installation + build à froid mesurés à **~70 s** en CI sur un runner
neuf — l'ordre de grandeur d'un build sans cache est donc de **1 min 40 à 2 min**,
soit environ le double. À arbitrer si le sujet redevient bloquant ; pas pour
aujourd'hui, le correctif tient.

**Leçons.**

> **Le seul build qui atteste de la production est celui qui l'installe comme
> la production.** `tsc` vert et `docker` vert ne disent rien de Vercel tant que
> les deux n'installent pas depuis la même racine.

- **Une dépendance n'est pas morte parce qu'aucun `import` ne la nomme.** Les
  paquets `@types/*` sont porteurs par *résolution*, pas par import : aucun grep
  ne les relie à un consommateur. Tout retrait d'un paquet de types doit être
  validé par une préversion Vercel, jamais par `tsc` seul.
- **Un check imprimé mais non lu est un check absent.** La ligne `Vercel fail`
  était sous les yeux au moment de la fusion. Le garde-fou n'a pas manqué : la
  lecture a manqué. **Corrigé structurellement le 27/07** : protection de
  branche sur `main`, avec `quality`, `docker`, `openapi-check` et **`Vercel`**
  rendus **bloquants** (`enforce_admins` compris — la règle vaut aussi pour
  celui qui l'a posée). Éprouvée : une PR au `quality` rouge s'est vue refuser
  la fusion (`the base branch policy prohibits the merge`). `integration` et
  `migrations-check` restent consultatifs — ils sont rouges sur toute PR
  dependabot faute de secrets, les rendre bloquants paralyserait le dépôt.
  *Une discipline qui repose sur l'attention finit par échouer un jour de
  fatigue ; une règle refuse le merge tous les jours.*
- L'audit du 27/07 qui a précédé la suppression était pourtant complet côté
  consommateurs *déclarés* (workflows, scripts, Dockerfile, configuration
  Vercel, liens entrants). Il a conclu « rien d'actif n'en dépend » — vrai pour
  `index.html` et `src/`, faux pour deux lignes de `devDependencies`. Un
  inventaire de références ne remplace pas un build dans l'environnement cible.

---

## 2026-07-26 — `/opengraph-image` en 500 : satori refuse les nœuds `<text>`

**Symptôme.** `GET /opengraph-image` répondait **500** après l'ajout du médaillon du sceau
dans l'image Open Graph. Aucune erreur applicative lisible côté route : le message n'apparaît
que dans les logs du serveur de développement, enveloppé dans un `failed to pipe response`.

```
[Error: failed to pipe response] {
  [cause]: Error: <text> nodes are not currently supported, please convert them to <path>
}
```

**Cause.** `next/og` rend via **satori**, qui ne sait pas composer un nœud SVG `<text>` : il
n'a pas de moteur de mise en forme de texte à l'intérieur d'un SVG, et demande des tracés.
Le médaillon avait été écrit en SVG en ligne avec la calligraphie `فيد` en `<text>` — la
forme naturelle en HTML, refusée ici.

Ce n'est pas une limite de la police ni de l'arabe : **tout** `<text>` est refusé, quel que
soit son contenu. Les `<path>`, `<rect>` et `<circle>` du même SVG passaient sans problème,
ce qui rendait l'échec d'autant plus déroutant — le fichier « marchait presque ».

**Correctif.** Composer le médaillon en `<div>` imbriqués (cercles obtenus par
`borderRadius: "50%"`, texte en enfant direct d'un `div`), technique déjà validée par
`apple-icon.tsx`. Depuis le passage au logotype vectoriel (lot 5), les assets de marque sont
des **tracés** (`<path>`/`<rect>`) lus sur disque et passés en data URI : le problème ne peut
plus se poser pour le logo lui-même.

**Leçon.**

> Dans `next/og`, du texte ne se compose qu'en `div`, jamais en `<svg><text>`. Un SVG destiné
> à satori doit être **entièrement vectorisé** — si un asset contient encore du texte
> composé, il n'est pas prêt pour l'OG.

Corollaire général, qui rejoint les deux entrées ci-dessous : **une route génératrice
d'image doit être vérifiée par son statut HTTP, pas par relecture du code.** Ici `pnpm build`
et `tsc` passaient tous les deux — seul un `curl` sur la route a révélé le 500.

---

## 2026-07-24 — L'API admin Supabase hoquette, `/me` renvoie 500, la CI accuse la mauvaise branche

**Symptôme.** Trois runs CI consécutifs (#211, #212, #213) rouges sur la branche
`refonte/tadelakt`, une refonte **purement cosmétique**. Seul le job `integration`
échouait (`quality`, `docker`, `migrations-check` verts), toujours sur le même message :

```
Email introuvable via l'API admin Supabase.
```

**Diagnostic.** Quatre éléments ont disculpé la refonte :

1. `git diff origin/main...refonte/tadelakt` ne touche **aucun** fichier de `api/`,
   `packages/`, `tests/` ni `.github/` — uniquement des composants, des pages et des tokens
   CSS. Le chemin de code en échec n'avait jamais été modifié.
2. Le **point de rupture changeait à chaque run** (trois tests différents, même erreur).
   Une régression déterministe casse toujours au même endroit ; un point mobile signe une
   défaillance externe.
3. Dans le run #213, `GET /me -> email présent` **passait** à `19:39:48.436`, et le même
   appel échouait **0,33 s plus tard**. Une clé absente ou révoquée aurait fait échouer le
   premier appel.
4. `main` était **vert avec le même job 16 h plus tôt** (run #210), mêmes secrets.

Les secrets étaient bien disponibles sur la branche (`migrations-check`, qui exige
`CI_MIGRATIONS_CHECK_URL`, était vert). À ne pas confondre avec les runs dependabot
(#207/#208), rouges pour une raison réellement différente — `SUPABASE_URL manquant`,
périmètre de secrets dependabot distinct.

**Cause retenue.** Défaillance **transitoire** de l'API admin Auth du projet Supabase de
dev (`/auth/v1/admin/users/:id`) — vraisemblablement du rate limiting, le scénario
enchaînant de nombreux appels admin en rafale.

> ⚠️ **La cause exacte n'a pas pu être confirmée** (429 ? 502 ? throttling ?) : le code
> écrasait tout statut non-2xx en `null`, sans jamais le journaliser. C'est précisément
> cette opacité qui est corrigée ci-dessous — la prochaine occurrence sera lisible.

**Ce que le flake révélait — deux vrais défauts, indépendants de la CI :**

1. **`buildMe()` jetait sur une panne amont passagère.** `/compte` et `GET`/`PATCH
   /api/v1/me` renvoyaient **500 à un utilisateur légitime** parce que Supabase avait
   hoqueté. L'e-mail est un champ parmi dix ; tout le reste du profil était disponible.
2. **`fetchAuthUserEmail()` avalait le statut HTTP** (`if (!response.ok) return null`) :
   « cet utilisateur n'existe pas » (404) et « l'amont est tombé » (429/5xx) rendaient la
   même valeur. Aucun appelant ne pouvait décider correctement.

**Correctif** (branche `fix/resilience-supabase-admin`) :

- **Wrapper unique instrumenté** (`apps/web/src/app/api/v1/_lib/supabaseAdmin.ts`) par
  lequel passe *tout* appel admin. Trois classes d'échec strictement séparées : `404` →
  `null` légitime ; `429`/`5xx`/réseau → `SupabaseAdminUnavailableError` après 2 retries
  bornés (backoff exponentiel + jitter, plafond ~1,5 s) ; autres `4xx` →
  `SupabaseAdminConfigError`, **jamais retentée**. Journalisation systématique sur
  non-2xx : opération, méthode, chemin (UUID pseudonymisé SHA-256 — donnée personnelle),
  statut, tentative, extrait de corps borné.
- **Dégradation gracieuse de `/me`** : profil rendu sans e-mail, avec
  `emailIndisponible: true`, au lieu d'un 500. Un 404 (compte auth réellement absent)
  continue d'échouer franchement — les deux cas ne se confondent plus.
- **`/compte`** affiche « Momentanément indisponible » plutôt qu'une page en erreur.
- **Tests unitaires** sur le wrapper (404 sans retry, 5xx transitoire typé, 401 sans
  retry, dégradation de `/me`) — c'est le cœur du correctif, il ne doit pas régresser.
- **CI planifiée quotidienne** (`ci.yml`, cron `20 4 * * *`) : une panne externe
  intermittente se manifeste désormais **d'elle-même, la nuit**, au lieu d'apparaître au
  milieu d'un lot de travail où elle se déguise en régression.

**Ce qui a été explicitement écarté** : isoler le job d'intégration, le passer en
`continue-on-error`, ou ajouter un retry global au workflow. *Masquer un flake est la
version CI du fallback silencieux.* L'assertion d'intégration reste rouge en cas de panne
amont — elle dit simplement, maintenant, **pourquoi**.

**Leçon — le motif, pas les deux lignes de code.**

C'est la **deuxième occurrence en cinq jours du même motif** (voir l'entrée du 19/07/2026
ci-dessous, déjà gravée dans `ci.yml:92-100`) : *une erreur amont écrasée dans une valeur
de repli indistinguable d'un cas nominal*. Le 19/07, c'était un fallback de clé API ; le
24/07, un `return null` sur non-2xx, un cran plus bas dans la même pile.

> **Un fallback silencieux n'est pas un filet de sécurité, juste un échec retardé et moins
> lisible.**

Deux occurrences rapprochées font une règle, pas une coïncidence :

- **Une valeur de repli ne doit jamais être ambiguë.** Si `null` peut signifier deux
  choses dont l'une est une panne, ce n'est pas un type de retour acceptable.
- **Toute erreur amont se journalise avec son statut**, même — surtout — quand on la
  rattrape.
- **Distinguer le transitoire du définitif est une décision d'architecture**, pas un
  détail d'implémentation : elle conditionne le retry, la dégradation et le message
  d'erreur.
- **Une dépendance externe tombe.** Une route qui devient 500 parce qu'un champ secondaire
  n'a pas pu être lu est un défaut de conception, pas une fatalité.

---

## 2026-07-19 — Clé Supabase révoquée en silence : 18 runs CI rouges avant diagnostic

*(Incident antérieur à ce fichier, consigné rétrospectivement le 24/07/2026 — la source de
vérité reste le commentaire de `.github/workflows/ci.yml:92-100`, conservé tel quel.)*

**Symptôme.** 18 runs CI rouges d'affilée, sans cause évidente.

**Cause.** `SUPABASE_ANON_KEY` (secret créé le 12/07, jamais renouvelé) avait été
**révoquée côté Supabase sans que rien ne le signale**. Le job d'intégration disposait
d'un *fallback* vers cette clé legacy : il basculait dessus silencieusement, et échouait
plus loin, sur un message sans rapport avec la cause réelle.

**Correctif.** Suppression des secrets legacy (`SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) du job : il tourne désormais sur les seules nouvelles clés
(`SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`, voir
`docs/MIGRATION-CLES-SUPABASE.md`). Côté tests, les deux causes d'échec longtemps
confondues — projet en pause vs clé invalide — ont été séparées en deux messages
explicites (`tests/integration.ts`, `getRealAccessToken`).

**Leçon.** Celle qui est citée en tête de `ci.yml` et reprise ci-dessus :

> **Un fallback silencieux n'est pas un filet de sécurité, juste un échec retardé et moins
> lisible.**
