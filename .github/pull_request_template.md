<!--
Gabarit créé le 03/08/2026. Fait générateur : la PR #75 a livré la priorité 2 de
`docs/SUIVI.md` sans mettre ce fichier à jour. Trois heures plus tard, l'état à date
annonçait encore comme « chantier à trancher » quelque chose qui tournait en production.

La règle « la relecture du SUIVI fait partie de la fusion » existait déjà — mais elle
n'existait QUE dans le SUIVI, c'est-à-dire dans le fichier qu'on oublie d'ouvrir. Une règle
qui ne vit que dans le document qu'elle protège n'est lue qu'après coup. Elle est donc ici,
sous les yeux au moment où le geste se fait.

Décocher une case est une réponse valable. Laisser une case vide sans rien en dire n'en est
pas une : ce gabarit sert à rendre une omission visible, pas à faire cocher.
-->

## Ce que fait cette PR

<!-- Le constat, puis la décision. Pas la liste des fichiers touchés : git la donne déjà. -->

## Pourquoi

<!-- Ce qu'on a mesuré, pas ce qu'on suppose. Si un chiffre est cité, dire d'où il vient. -->

---

## Avant de fusionner

- [ ] **`docs/SUIVI.md` est à jour** — SHA d'en-tête, section « ce qui tourne », file de
      travail. Si cette PR livre une entrée de la file, elle **sort** de la file et **entre**
      dans « derniers lots livrés » ; les priorités se renumérotent. *Ce document se périme à
      chaque fusion : sa mise à jour fait partie de la fusion, pas du ménage d'après.*
- [ ] **Les quatre checks bloquants sont verts** : `quality`, `docker`, `openapi-check`,
      **`Vercel`**. Le check `Vercel` est le seul garde-fou réel sur le chemin de build
      (`docs/INCIDENTS.md`, 27/07/2026) — **un check imprimé mais non lu est un check
      absent.** `integration` et `migrations-check` sont consultatifs faute de secrets sur
      Dependabot : un échec réel y reste un échec réel, il se lit et se justifie.
- [ ] **Le CONTRAT-V1 est respecté, ou amendé explicitement.** Tout ajout à la liste fermée
      des endpoints (§4), toute évolution du modèle de domaine (§3) ou de la charte (§8) est
      un **amendement conscient, numéroté et daté** dans `docs/CONTRAT-V1.md` — jamais une
      dérive qu'on découvre à la relecture.
- [ ] **Migration** : si cette PR en porte une, elle est appliquée **avant** la fusion quand
      elle est rétrocompatible, sur le **port 5432** (Session pooler), sur confirmation
      explicite et nommée (CONTRAT-V1 §7). Sinon, cocher sans objet.
- [ ] **Aucun chiffre, libellé ou texte repris d'une maquette** (CONTRAT-V1 §8 règle 5). Les
      maquettes sont des références **visuelles** ; leur contenu est du remplissage. Un
      chiffre affiché vient de la base, ou n'est pas affiché.
- [ ] **Aucun repli silencieux.** Une erreur amont se journalise **avec son statut** et se
      signale ; une valeur de repli ne doit jamais être ambiguë (`docs/INCIDENTS.md`, trois
      occurrences du même motif). Si un chemin dégrade, il dit qu'il dégrade.
- [ ] **Ce qui n'a pas été vérifié est écrit ci-dessous**, plutôt que passé sous silence.

## Ce que cette PR ne vérifie pas

<!--
Les limites assumées : ce qui n'a pas pu être testé, ce qui reste à faire à la main, ce qui
dépend d'une configuration externe (dashboard Supabase, variables Vercel, secrets GitHub).
« Rien » est une réponse acceptable — l'absence de réponse ne l'est pas.
-->
