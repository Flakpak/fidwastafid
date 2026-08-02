# RUNBOOK — Restauration d'un backup fidwastafid

*Procédure à suivre en cas de perte, corruption ou suppression accidentelle de données.*
*Reste calme : un backup restaurable existe. Suis les étapes dans l'ordre.*

---

## CE QUE TU RESTAURES

- **Format** : dump `pg_dump` plain SQL, compressé `.sql.gz`.
- **Options du dump** : `--no-owner --no-privileges` → restaurable dans n'importe quel
  Postgres (nouveau projet Supabase, Postgres local, futur VPS) sans dépendre des rôles Supabase.
- **Où il est — une seule source, et c'est tout** : **artefact GitHub Actions**. Onglet
  *Actions* → un run *Backup base de données* → section **Artifacts** en haut →
  `db-backup-<date>`. **Rétention 30 jours**, au-delà l'artefact est supprimé par GitHub.

> ⚠️ **Il n'existe aucune copie hors GitHub.** `db-backup.yml` contient bien une étape
> d'envoi vers Cloudflare R2, mais elle est conditionnée à `R2_ACCOUNT_ID` et `R2_BUCKET`,
> **absents des secrets du dépôt** (vérifié le 2026-08-02) : elle a toujours été sautée,
> aucun objet n'a jamais été écrit dans un bucket. Ce runbook a décrit pendant des
> semaines une procédure de récupération « depuis R2 » qui n'aurait rien trouvé — au pire
> moment possible, celui où on le lit. Elle est retirée.
>
> **Conséquences à connaître avant d'en avoir besoin** : au-delà de 30 jours, il n'y a
> plus rien ; si le dépôt GitHub devient inaccessible, il n'y a plus rien non plus. Le
> plan Supabase est **Free**, donc sans backup managé ni PITR — cet artefact est la
> **ligne de défense unique**. Rétablir une seconde copie suppose de créer un bucket R2 et
> de poser les quatre secrets ; tant que ce n'est pas fait, ce paragraphe reste vrai.

---

## RÈGLE D'OR

**Ne restaure JAMAIS directement par-dessus la prod comme premier réflexe.**
Restaure d'abord dans une base **de côté** (scratch), vérifie que les données sont bonnes,
puis seulement décide quoi remettre en prod. Un backup restauré au mauvais endroit peut
aggraver l'incident.

---

## ÉTAPE 1 — Récupérer le backup

### Depuis GitHub (cas normal)
1. Repo → onglet **Actions** → clique un run vert de *Backup base de données*.
2. En haut de la page du run, section **Artifacts** → télécharge `db-backup-<date>`.
3. Tu obtiens un `.zip`. Décompresse-le : à l'intérieur, le fichier `.sql.gz`.

```bash
unzip db-backup-<date>.zip
ls -lh *.sql.gz
```

### Si GitHub est indisponible, ou si le backup a plus de 30 jours

**Il n'y a pas de seconde source.** Ce n'est pas un oubli de rédaction : aucun stockage
externe n'a jamais reçu de dump (voir l'encadré plus haut). Dans ce cas :

1. La base de production est **toujours là** — un artefact expiré ne veut pas dire des
   données perdues. Vérifier d'abord que l'incident est bien une perte de données.
2. Prendre immédiatement un dump manuel de l'état courant avant toute autre manœuvre :
   `gh workflow run db-backup.yml`, ou `pg_dump` en local avec la chaîne Session pooler
   (port 5432) si GitHub est inaccessible.
3. Si les données sont réellement perdues **et** qu'aucun artefact n'est récupérable, il
   n'existe aucun autre point de restauration. C'est le risque assumé aujourd'hui, et la
   raison pour laquelle la copie externe reste au restant de la Phase 0.

---

## ÉTAPE 2 — Vérifier le backup avant de l'utiliser

```bash
# Décompresser
gunzip fidwastafid_<id>.sql.gz     # produit fidwastafid_<id>.sql

# 1. Le dump est-il complet ? (doit afficher la ligne de fin)
grep "PostgreSQL database dump complete" fidwastafid_<id>.sql

# 2. Aperçu du contenu : quelles tables ?
grep -c "CREATE TABLE" fidwastafid_<id>.sql
grep "CREATE TABLE public\." fidwastafid_<id>.sql | head -30
```

Si le marqueur de fin est absent → **le dump est tronqué, n'utilise pas celui-ci**, prends le précédent.

---

## ÉTAPE 3 — Restaurer dans une base de côté (scratch) et contrôler

C'est l'étape qui te protège. On restaure dans un Postgres jetable, on regarde, on décide.

### Option rapide : Postgres local via Docker
```bash
# Lancer un Postgres jetable
docker run --name scratch -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres:17

# Restaurer dedans (les erreurs sur rôles/extensions Supabase absents sont NORMALES et sans gravité)
psql "postgresql://postgres:test@localhost:5433/postgres" -f fidwastafid_<id>.sql

# Contrôler les données
psql "postgresql://postgres:test@localhost:5433/postgres" -c \
  "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;"
```

Regarde le nombre de lignes par table : est-ce cohérent avec ce que tu attends ?
Inspecte les tables clés (deals, votes, commentaires) :
```bash
psql "postgresql://postgres:test@localhost:5433/postgres" -c "select count(*) from deals;"
psql "postgresql://postgres:test@localhost:5433/postgres" -c "select * from deals order by id desc limit 5;"
```

Quand tu as fini :
```bash
docker rm -f scratch
```

---

## ÉTAPE 4 — Choisir le scénario de restauration réel

**RLS (22/07/2026, migration `0008_rls_public_tables.sql`)** : les 9 tables
`public` ont `ENABLE ROW LEVEL SECURITY` **sans policy** (ferme le canal
PostgREST/API Data, advisor `rls_disabled_in_public` — cf. SUIVI). `pg_dump`
capture cet état comme partie de la définition de table (indépendant de
`--no-owner --no-privileges`, qui ne touche que propriétaire/grants) : un
dump pris **après** cette migration restaure les tables avec RLS déjà actif,
rien à refaire. Un dump pris **avant** (backup plus ancien) restaure des
tables **sans** RLS — dans ce cas, après restauration, réapplique les
migrations manquantes (`pnpm migrate` contre la base restaurée) plutôt que
de considérer la restauration terminée : la base doit ressortir avec RLS
activé sur les 9 tables, jamais un retour silencieux à l'état pré-migration.

### Scénario A — Perte totale de la base (nouveau projet Supabase)
1. Crée un nouveau projet Supabase (ou une nouvelle base sur ton futur VPS).
2. Récupère sa chaîne de connexion (**Session pooler** si Supabase, pour l'IPv4).
3. Restaure le dump complet dedans :
   ```bash
   psql "postgresql://postgres.<ref>:<mdp>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
     -f fidwastafid_<id>.sql
   ```
   Les objets Supabase déjà présents (schémas `auth`, `storage`…) provoqueront des
   erreurs « already exists » : **c'est attendu**. Ce qui compte, ce sont tes tables
   `public` (données métier), qui se recréent sur une base vierge.
4. **Vérifie** ensuite : compte les lignes des tables clés, teste une page du site,
   et confirme RLS actif (`select relname, relrowsecurity from pg_class where
   relnamespace='public'::regnamespace and relkind='r';` → `true` partout, cf.
   note RLS ci-dessus).
5. Bascule la variable `DATABASE_URL` de l'app vers la nouvelle base, redéploie.

### Scénario B — Suppression accidentelle d'UNE table ou de quelques lignes
Ne restaure pas toute la prod. Restaure en scratch (Étape 3), puis recopie seulement
ce qui manque :
```bash
# Exporter la table depuis le scratch
pg_dump "postgresql://postgres:test@localhost:5433/postgres" \
  --no-owner --no-privileges --table=public.<table> -f table_recuperee.sql

# La réinjecter dans la prod (après avoir vérifié qu'elle est bien absente/vide)
psql "<CHAINE_POOLER_PROD>" -f table_recuperee.sql
```
Pour quelques lignes seulement : extrais-les en `INSERT` depuis le scratch et applique-les
à la main. **Réfléchis avant chaque écriture en prod.**

### Scénario C — Migration prévue vers le VPS (Phase 9)
Même commande que le Scénario A, cible = Postgres du VPS. Le dump `--no-owner`
se restaure proprement dans un Postgres nu. C'est la répétition générale prévue au plan.

---

## ÉTAPE 5 — Après restauration

- [ ] Compter les lignes des tables critiques vs. ce qui est attendu.
- [ ] Charger 2-3 pages du site (feed, une page deal) pour valider bout en bout.
- [ ] Vérifier que l'app pointe bien sur la bonne base (`DATABASE_URL`).
- [ ] Vérifier RLS actif sur les 9 tables `public` (voir note RLS, Étape 4) — sinon
      réappliquer les migrations manquantes avant de considérer la restauration terminée.
- [ ] Noter dans un incident log : date, cause, backup utilisé, actions faites.
- [ ] Relancer un backup manuel (*Run workflow*) pour figer le nouvel état sain.

---

## EXERCICE PÉRIODIQUE (ne pas sauter)

Le workflow teste déjà une restauration à chaque run. Mais **une fois par trimestre**,
fais une restauration manuelle complète (Étape 3) pour garder le geste en mémoire et
vérifier que la procédure ci-dessus est toujours exacte. Un runbook non répété se périme.

---

## AIDE-MÉMOIRE — pièges connus

| Symptôme | Cause | Solution |
|---|---|---|
| `could not translate host name` / timeout | Chaîne directe (IPv6) au lieu du pooler | Utiliser la chaîne **Session pooler** (`...pooler.supabase.com:5432`) |
| `server version mismatch` | `pg_dump`/`psql` plus vieux que le serveur | Installer le client Postgres ≥ version serveur (17) |
| Nombreuses erreurs `role ... does not exist` | Restauration d'un dump Supabase dans un Postgres nu | **Normal** — les rôles Supabase n'existent pas ailleurs ; les données `public` passent quand même |
| `already exists` sur `auth`/`storage` | Restauration dans un projet Supabase déjà initialisé | **Normal** — seules tes tables `public` importent |
| Dump très petit / marqueur de fin absent | Dump tronqué | Prendre le backup précédent |
