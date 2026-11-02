-- Rattrapage ponctuel : activités Strava de musculation rangées à part (activity_logs « Musculation »)
-- alors que la séance du même jour avait été validée dans Ostryk. Même règle que
-- lib/strava.js (rattacherStravaALaSeance) : activité libre ne contenant qu'UNE activité Strava,
-- séance validée le même jour (heure de Paris), pas encore liée à Strava, séance non « cardio »
-- et programme qui n'est pas d'une autre discipline.
--
-- 1) Lancer d'abord l'APERÇU seul pour voir les paires trouvées.
-- 2) Puis lancer le bloc FUSION.

-- APERÇU ---------------------------------------------------------------------------------------
with paires as (
  select distinct on (l.id)
    l.id as log_id, c.id as completion_id, l.strava_activity_ids[1] as strava_id,
    l.duration_minutes, l.km, a.name as sportif, l.date, s.title as seance
  from activity_logs l
  join athletes a on a.id = l.athlete_id
  join program_completions c on c.athlete_id = l.athlete_id
    and (c.completed_at at time zone 'Europe/Paris')::date = l.date
    and c.strava_activity_id is null and c.skipped = false
  join program_sessions s on s.id = c.program_session_id
  join programs p on p.id = s.program_id
  where l.type = 'custom' and cardinality(l.strava_activity_ids) = 1
    and l.label ~* '(muscu|renfo|crossfit)'
    and coalesce(s.activity_mode, 'standard') <> 'cardio'
    and coalesce(p.activity_type, '') !~* '(course|run|footing|trail|v[ée]lo|cycl|bike|vtt|natation|nage|swim|marche|rando|walk|hike|yoga|aviron|rameur|row)'
  order by l.id, c.completed_at
)
select sportif, date, seance, strava_id, duration_minutes from paires order by date desc;

-- FUSION ---------------------------------------------------------------------------------------
-- begin;
-- create temp table paires on commit drop as
-- select distinct on (l.id)
--   l.id as log_id, c.id as completion_id, l.strava_activity_ids[1] as strava_id, l.duration_minutes, l.km
-- from activity_logs l
-- join program_completions c on c.athlete_id = l.athlete_id
--   and (c.completed_at at time zone 'Europe/Paris')::date = l.date
--   and c.strava_activity_id is null and c.skipped = false
-- join program_sessions s on s.id = c.program_session_id
-- join programs p on p.id = s.program_id
-- where l.type = 'custom' and cardinality(l.strava_activity_ids) = 1
--   and l.label ~* '(muscu|renfo|crossfit)'
--   and coalesce(s.activity_mode, 'standard') <> 'cardio'
--   and coalesce(p.activity_type, '') !~* '(course|run|footing|trail|v[ée]lo|cycl|bike|vtt|natation|nage|swim|marche|rando|walk|hike|yoga|aviron|rameur|row)'
-- order by l.id, c.completed_at;
-- -- une séance ne reçoit qu'une activité Strava
-- delete from paires a using paires b where a.completion_id = b.completion_id and a.log_id > b.log_id;
-- update program_completions c set
--   strava_activity_id = p.strava_id,
--   duration_minutes = coalesce(c.duration_minutes, p.duration_minutes),
--   distance_km = coalesce(c.distance_km, p.km)
-- from paires p where c.id = p.completion_id;
-- delete from activity_logs where id in (select log_id from paires);
-- commit;
