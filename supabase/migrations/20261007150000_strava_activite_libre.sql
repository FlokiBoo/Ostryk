-- Activité Strava hors programme : enregistrée comme une activité (activity_logs), plus comme un
-- programme "Séance libre" créé pour l'occasion — qui s'empilait dans les microcycles du coach.
--
-- activity_logs n'a qu'une ligne par (sportif, jour, discipline) : deux sorties vélo le même jour
-- s'y additionnent. La liste des ids Strava déjà comptés est ce qui rend l'import rejouable sans
-- doublon (Strava redélivre ses webhooks, et l'import rétroactif repasse sur les mêmes activités).
--
-- À exécuter AVANT de mettre en ligne le code qui lit cette colonne.

alter table activity_logs
  add column if not exists strava_activity_ids bigint[] not null default '{}';

comment on column activity_logs.strava_activity_ids is
  'Ids des activités Strava déjà comptées dans cette ligne (clé d''idempotence de l''import).';
