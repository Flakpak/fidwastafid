# INCIDENTS — fidwastafid

*Journal des incidents de production et d'infrastructure. **Ordre antichronologique** :
l'entrée la plus récente en tête. Une entrée se lit seule — symptôme, diagnostic, cause,
correctif, leçon — sans exiger d'avoir suivi la conversation d'origine.*

*Ce fichier n'est pas un `CHANGELOG` : on n'y consigne que ce qui a **cassé**, et ce qu'on
en a appris. Une leçon gravée ici a vocation à être citée depuis le code ou la CI, comme
`ci.yml` cite déjà celle du 19/07/2026.*

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
