-- diffusions.mode — CONTRAT-V1 §4, dix-septième amendement prolongé le
-- 08/08/2026. Un envoi de TEST n'écrit plus du tout dans cette table (voir
-- _lib/diffusion.ts — il ne pose jamais deja_diffuse, ne bloque jamais une
-- diffusion réelle ultérieure) : sa trace vit dans journal_audit
-- (details.canalTest), déjà distincte.
--
-- Cette colonne existe pour un fait différent : annuler() (« Retirer »)
-- appelait jusqu'ici canal.supprimer() en ciblant la production EN DUR,
-- justifié par « aucune ligne test n'existe ici ». Vrai aujourd'hui, mais un
-- fait supposé plutôt que lu — exactement le défaut du repli silencieux déjà
-- corrigé côté envoi (dix-septième amendement). `mode` rend ce fait EXPLICITE :
-- annuler() lit la valeur réelle de la ligne plutôt que de la deviner.
--
-- Défaut 'production' : toute ligne existante (et toute future ligne, tant
-- que rien n'écrit de mode 'test' ici) l'est réellement.
alter table diffusions add column mode text not null default 'production';
alter table diffusions add constraint diffusions_mode_check check (mode in ('production', 'test'));
