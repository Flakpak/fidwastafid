# RUNBOOK — Restauration d'un backup fidwastafid

*Procédure à suivre en cas de perte, corruption ou suppression accidentelle de données.*
*Reste calme : un backup restaurable existe. Suis les étapes dans l'ordre.*

---

## CE QUE TU RESTAURES

- **Format** : dump `pg_dump` plain SQL, compressé `.sql.gz`.
- **Options du dump** : `--no-owner --no-privileges` → restaurable dans n'importe quel
  Postgres (nouveau projet Supabase, Postgres local, futur VPS) sans dépendre des rôles Supabase.
- **Où il est** :
  - **GitHub** (toujours) : onglet *Actions* → un run *Backup base de données* → section **Artifacts** en haut → `db-backup-<date>`. Rétention 30 jours.
  - **Cloudflare R2** (si configuré) : bucket, clé `fidwastafid/<date>.sql.gz`. Durable.

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

### Depuis R2 (si GitHub indisponible ou backup > 30 j)
```bash
export AWS_ACCESS_KEY_ID=...        # clés R2
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=auto
# Lister les backups disponibles
aws s3 ls s3://<bucket>/fidwastafid/ \
  --endpoint-url "https://<account_id>.r2.cloudflarestorage.com"
# Télécharger celui voulu
aws s3 cp s3://<bucket>/fidwastafid/<date>.sql.gz . \
  --endpoint-url "https://<account_id>.r2.cloudflarestorage.com"
```

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
4. **Vérifie** ensuite : compte les lignes des tables clés, teste une page du site.
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
