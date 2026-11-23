-- 0032 — Fusion des fiches en double (lot SEO-2j, CONTRAT-V1 §3,
-- vingt-sixième amendement, 23/11/2026).
--
-- Liste figée par public_id, relevée en production le 23/11/2026 : 164 produits,
-- 173 fiches fusionnées (12 publiées, 161 expirées). Fiche conservée :
-- publiée active au vu_le le plus récent ; à égalité, la plus anciennement publiée.
--
-- Hors périmètre : les 7 produits dont l'empreinte a été rejetée par l'admin
-- (revue humaine en cours), et les soumissions communautaires.
--
-- Transaction : assurée par le runner (packages/db/src/migrate.ts).

create temporary table fusion_0032 (
  perdant text primary key,
  gagnant text not null,
  statut_attendu text not null
) on commit drop;

insert into fusion_0032 (perdant, gagnant, statut_attendu) values
  ('rickgs3u8k', 'bx3s2d6mzb', 'expire'),
  ('m2euhicykv', 'pg2dpkucey', 'expire'),
  ('6tpk4ytgjt', 'ez32res6p8', 'expire'),
  ('7g792js7jv', 'jfcvp7gd7i', 'expire'),
  ('jfx84zwz6w', '4bjcyfmg9m', 'expire'),
  ('gybicwm78v', '45cpz2rh2v', 'expire'),
  ('znz2tx56r5', 'v4auk4imxz', 'expire'),
  ('ijpvap4zmi', 'qp3j6uzusn', 'expire'),
  ('vymee34f58', 'nydvpz3i5e', 'expire'),
  ('3n8z9gqjwz', 'znhd8x87gi', 'expire'),
  ('4q446yakys', 'yzppx97axx', 'expire'),
  ('pc2dzxec2k', 'di4zer6e77', 'expire'),
  ('rw8c93aamf', 'uajp4rfkxs', 'expire'),
  ('5fd4ajdkk2', 'ssm5tt7hyk', 'expire'),
  ('zwac59qq33', 'mge74wcpgz', 'expire'),
  ('5nrjtb63a8', 'irmjs445jx', 'expire'),
  ('p6skjqihg8', 'zkbw4gcpvu', 'expire'),
  ('6pbbadfaxk', 'akywvsjwuw', 'expire'),
  ('pkq7gqmuyu', 'sxhrk2fxgd', 'expire'),
  ('hcc75e7tf2', '5ymg5ijvp4', 'expire'),
  ('nit7kwqkx8', 'mcp2qamer6', 'expire'),
  ('nm7b75j8ga', '5fwpz8y9yj', 'expire'),
  ('qcp678fhe5', 'sxv28ihzdj', 'expire'),
  ('tsukxtebs3', 'gttf7vc8rj', 'expire'),
  ('e62dy4pntb', '53b5fc4dst', 'expire'),
  ('3rd2qjmaud', 'vc4v36tkip', 'expire'),
  ('m6z7gwk6zz', 'dqctsn29vy', 'expire'),
  ('29ray5k97s', '58kf4dwgtv', 'expire'),
  ('9euiepj62z', 'wj5rdeajbb', 'expire'),
  ('ptgad6774a', 'esrxd2u4fz', 'expire'),
  ('nwp78mz4cc', 'sk48higpbc', 'expire'),
  ('2ivkxkktgm', 'fa2amm2p4b', 'expire'),
  ('wfab3jv8gg', 'spqvawpsju', 'expire'),
  ('mhnzms92vi', 'tq3k45qj6p', 'expire'),
  ('iq34i3mxgu', 'rmg3zu3dwk', 'expire'),
  ('xwwah3eh8d', '5tmzz3wjw8', 'expire'),
  ('ipicq4z63p', 'ju9zdc6c45', 'expire'),
  ('astuqjx42b', '7tn54b4j2h', 'expire'),
  ('jh7nt8ni72', 'n63xwzfjvj', 'expire'),
  ('m497qarjn4', '74en8cwdgk', 'expire'),
  ('tmsymj2qm3', 'tsqr2dkygp', 'expire'),
  ('ubjtppnzfz', '8t3ugm8azh', 'expire'),
  ('qn2ca89255', '9tcngzj9cg', 'expire'),
  ('z77p9h94qs', 'huat6k3gnc', 'expire'),
  ('wdq5b3pcx8', 'dna8bseaay', 'expire'),
  ('enb3nxcmun', 'iwub8tmr87', 'expire'),
  ('jbsswce4a3', 'xg2sc3fxvh', 'expire'),
  ('7zbtykm4m6', 'ftewhkitt3', 'expire'),
  ('83dy7wcq7f', 'sixcenncs7', 'expire'),
  ('ku42v9tqjj', 'egkg7at52d', 'expire'),
  ('g3dtx5mtkw', '4xnbgnwrqr', 'expire'),
  ('3q2t8jf63f', 'tmpbxrifag', 'expire'),
  ('eeysu38kb2', 'brpvuct8ap', 'expire'),
  ('7q3kw4k9cz', 'pbiujwqv9n', 'expire'),
  ('9qctn4nnm9', 'kbd4zeryq7', 'expire'),
  ('85ez9z577n', 'zx5artmisp', 'expire'),
  ('9tnxxeedh9', '954qw9ft7f', 'expire'),
  ('vdwtvhrbgu', '2nu6aksm2x', 'expire'),
  ('qxhtdtxwa8', '9hu39pfaf9', 'expire'),
  ('9k4ebuc9hx', 'ca9krewjib', 'expire'),
  ('q629xhuv6d', 'a4sumxewk5', 'expire'),
  ('4acg23qdvs', 'raybhgvtdb', 'expire'),
  ('smnkmhbfwr', 'uyijge57wx', 'expire'),
  ('tpeppfnk7d', 't7d8p6ej4y', 'expire'),
  ('x5qk7i6niv', 'jffhwpgdvb', 'expire'),
  ('dccpfve6kn', 'xjdesu52vt', 'expire'),
  ('kebh5jx6qb', 'fc5jzr5krx', 'expire'),
  ('e65pqzqcyi', 'gkidytyv72', 'expire'),
  ('eppxrmc7wf', 'ma679mg6dr', 'expire'),
  ('2gqfvxedss', 'dwys4y5xtd', 'expire'),
  ('xjam86b7nx', 'd23dq884f4', 'expire'),
  ('gf58kdqwq8', '5jecgvmuei', 'expire'),
  ('kik9bucuue', '7azqxmu7bu', 'expire'),
  ('qfczh3vqyy', 'fea29cmaif', 'expire'),
  ('hxy3tmf9pi', 'ddzv8pxs3k', 'expire'),
  ('c77eh6mcpk', 'rm788bi3ai', 'expire'),
  ('nqv2csf5ej', '496rrqvwzv', 'expire'),
  ('zz9id8atww', '6ppdmccbaj', 'expire'),
  ('ufws4jy32c', 'sbt7qrvthb', 'publie'),
  ('nhbm7xqj3z', 'tvysn4kesv', 'expire'),
  ('aqyka694ue', 'w84uxm5f3c', 'expire'),
  ('nhabkbczcs', 'wmxc8vc6u2', 'expire'),
  ('asw99qmz3t', 'abgiwicafv', 'expire'),
  ('7t9qyfsfah', 'bqv3qhcr23', 'expire'),
  ('v83rvsx9rq', 'zsxnhzzij5', 'expire'),
  ('zp8rnduj67', 'df4m2dufb3', 'expire'),
  ('asg2e2zypm', 'vs58mhqsic', 'expire'),
  ('usqewd57c6', 'c22ywhwn6g', 'expire'),
  ('3d79xd6izt', '6p4kp5ijui', 'expire'),
  ('33wtq73use', 'mfc29e99v6', 'expire'),
  ('5e7zbamhtw', '7nk97kg4u5', 'expire'),
  ('yi4cfferz2', '593mh9n4gj', 'expire'),
  ('8tjd57ey39', '593mh9n4gj', 'publie'),
  ('uqdh3nsxqg', 'va53vxp2y5', 'expire'),
  ('7czf2dxey7', 'ncjtwkte9p', 'expire'),
  ('y69s2muf4m', 'e6mz35uffr', 'publie'),
  ('wy5b4zpeig', 'w7piwz7c3h', 'expire'),
  ('4tb8kbmb4p', 'dq7izketn3', 'expire'),
  ('5w665fzavr', '9csnfbfrjt', 'publie'),
  ('duttmgtazs', 'gb84sntjd5', 'expire'),
  ('pekn9tjzf9', 'x422kbu6c9', 'publie'),
  ('bz6mxjxs8u', 'vb75hcpsr8', 'expire'),
  ('js67zptqtu', 'kgtj5ttzfh', 'expire'),
  ('yjrmjiena5', '4mcah74jzb', 'publie'),
  ('rziykc69qd', 'xhaqq3sqf2', 'expire'),
  ('mrk8mzajus', 'jsifwzffqv', 'expire'),
  ('kaitb75u5k', 'drtfjc97fh', 'expire'),
  ('itmgviniyp', 'wcabyhs8ui', 'expire'),
  ('23vtth3ryg', 'q7ktt7h8z5', 'expire'),
  ('ven3pe78sz', 'dpv85gvcw5', 'expire'),
  ('xswqwrqqqc', '929pf3wdmi', 'expire'),
  ('2bfskesc3i', '3yaqe9uqzb', 'expire'),
  ('g4k9qimxa9', '6kprut5uq4', 'expire'),
  ('vs65u3rgnb', '8fjgiujtzk', 'expire'),
  ('yhuzwmvf9d', 'c7cwbih6px', 'expire'),
  ('gny73d32kc', '3as4kjmiez', 'expire'),
  ('2iak7d89rn', '9eefe3vsri', 'expire'),
  ('kji37gnyjg', 'n635asdiwp', 'expire'),
  ('e8tkwh4g4e', 'qcs4ju7e3b', 'expire'),
  ('6fzpnkzppx', 'qcs4ju7e3b', 'expire'),
  ('i4xz5g2crx', '33dcq3mz57', 'expire'),
  ('bm9au4giji', 'rb8giqh334', 'expire'),
  ('eikr8vheei', '2xmvjxsuht', 'expire'),
  ('9bdzsg8df3', 'gey8vmjrh2', 'expire'),
  ('2xd9txk6n8', '97rdvwiz7d', 'expire'),
  ('3q7ddqdg8u', '4qj5dtw42w', 'expire'),
  ('t2w3rt5bwu', 'z5kvsarybi', 'expire'),
  ('ht42y8n795', '3tsmd2jv27', 'expire'),
  ('fcagvarhm3', 'fy7ej2vhyd', 'expire'),
  ('pc77zpunpr', 'q3g2pde4bw', 'expire'),
  ('c7ry944syj', 'axhx3bzjxi', 'publie'),
  ('8brn47ik8p', 'h4w5vaf5gk', 'expire'),
  ('hehji26q3s', 'h4w5vaf5gk', 'expire'),
  ('unm3fukk6j', 'j732hmzhge', 'publie'),
  ('6qpgwjn5tm', '6uyes3d66h', 'expire'),
  ('cwnei5q27k', 'yyz7cafa95', 'expire'),
  ('qdf4fivvk4', 'yyz7cafa95', 'publie'),
  ('rabgpewuyu', 'c4e6abiyz6', 'expire'),
  ('ee9wf52yej', 'u8a9np3dg8', 'expire'),
  ('8gen674cqq', 'xpirdnmm8u', 'publie'),
  ('969pmzbzdz', 'xpirdnmm8u', 'publie'),
  ('25apmbic2e', 'aisvq3bsdp', 'expire'),
  ('vt2b6cawri', 'f2iw2865ty', 'expire'),
  ('tzvhpj7qws', 'g5ug3udjx4', 'expire'),
  ('2ivjg4vmrq', '87dfp9p7g2', 'expire'),
  ('2n8c5zb8b8', 'xv8yna46sd', 'expire'),
  ('8ny8mt9tui', 'p4zujuivv9', 'expire'),
  ('wuv426txyi', 'kkndpg5bu6', 'expire'),
  ('7vfuh923u2', 'zeaanbmdvj', 'expire'),
  ('ej5vr3rzzj', 'zeaanbmdvj', 'expire'),
  ('zjmn3r2kwm', 'zeaanbmdvj', 'publie'),
  ('3xut7j4abc', 'rgj3tzj4si', 'expire'),
  ('32ebpipnjp', '4wku2uwbvn', 'expire'),
  ('ntpnrj9ysc', 'j8j3kvammd', 'expire'),
  ('uusuxc5k7y', 'x3u3gh97i3', 'expire'),
  ('49nx8kwbe5', 'ag7ia637dt', 'expire'),
  ('gwwwirfi3q', 'wxx8k8mka9', 'expire'),
  ('ja35bue75s', 'zr2jakuiz7', 'expire'),
  ('224eqjwbm5', 'ic6but6327', 'expire'),
  ('sjz3jvhvib', 'ic6but6327', 'expire'),
  ('trsjt6amqf', 'f7z5zs8dxk', 'expire'),
  ('8f2937g8x9', 'f8ry64irhf', 'expire'),
  ('4zkv3pq9qn', 'tdmqzx9zuk', 'expire'),
  ('acdmbd77aj', 'yk62izqg82', 'expire'),
  ('7uhjwgkvfq', 'x2beh8d2tq', 'expire'),
  ('psuxqya72w', '5dc42xz6em', 'expire'),
  ('rph6b59r4k', 'tiqpeyarnv', 'expire'),
  ('wu8cvdpit5', '3nnwwdgefs', 'expire'),
  ('wpemfuybfg', '9zczwkkp72', 'expire'),
  ('uuu8q94449', '9j7m6jvxc4', 'expire'),
  ('nfzwqfjshh', '9j7m6jvxc4', 'expire'),
  ('vbycbf24pr', 'qgbg6vr3vd', 'expire'),
  ('r9sxrjghpu', 'aiyupbsuzd', 'expire');

update deals d
   set statut = 'expire', fusionne_dans = f.gagnant, updated_at = now()
  from fusion_0032 f
 where d.public_id = f.perdant
   and d.statut = f.statut_attendu
   and d.supprime_le is null;

-- Contrôle : 173 fiches fusionnées, toutes vers une fiche publiée non fusionnée,
-- et plus aucun produit (hors empreintes rejetées par l'admin) avec plus d'une
-- fiche publiée active. Sinon exception et annulation. Seul cas toléré, comme
-- 0024 : aucune de ces fiches n'existe (base vierge du job CI integration).
do $$
declare
  existants integer;
  fusionnees integer;
  cibles_valides integer;
  doublons integer;
begin
  select count(*),
         count(*) filter (where d.fusionne_dans = f.gagnant and d.statut = 'expire' and d.updated_at = now()),
         count(*) filter (where c.statut = 'publie' and c.fusionne_dans is null and c.supprime_le is null)
    into existants, fusionnees, cibles_valides
    from fusion_0032 f
    join deals d on d.public_id = f.perdant
    left join deals c on c.public_id = f.gagnant;

  if existants = 0 then
    raise notice '0032 : aucune fiche présente (base sans données de production) — rien à fusionner';
    return;
  end if;

  if fusionnees <> 173 or cibles_valides <> 173 then
    raise exception '0032 : % fusionnées, % cibles valides, 173 attendues — migration annulée', fusionnees, cibles_valides;
  end if;

  select count(*) into doublons from (
    select empreinte_curation(d.lien, d.titre, d.enseigne_id) as empreinte
      from deals d
     where d.statut = 'publie' and d.supprime_le is null
       and (d.date_fin is null or d.date_fin >= (now() at time zone 'Africa/Casablanca')::date)
     group by 1
    having count(*) > 1
  ) g
  where not exists (
    select 1 from memoire_curation m
     where m.empreinte = g.empreinte and m.decision = 'rejete' and m.levee_le is null
  );
  if doublons <> 0 then
    raise exception '0032 : % produit(s) ont encore plusieurs fiches publiées actives — migration annulée', doublons;
  end if;
end
$$;
