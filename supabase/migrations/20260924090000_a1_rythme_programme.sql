-- Lot A1 — le "pourquoi" du rythme conseillé, et les bornes du conseil.
--
-- Il n'y a pas de table d'inscription dans Ostryk : s'inscrire à un programme duplique la ligne
-- programs (athlete_id + source_program_id). Tout se joue donc sur programs.
-- recommended_sessions_per_week, min_hours_between_sessions et athlete_days_of_week existent déjà.

-- 1. À lancer SEUL d'abord. Si des lignes sortent, corrige-les : sinon le point 3 échoue à la
--    validation de l'existant.
select id, title, recommended_sessions_per_week
  from programs
 where recommended_sessions_per_week is not null
   and recommended_sessions_per_week not between 1 and 7;

-- 2. Le texte affiché sous le conseil dans la popup de choix des jours.
alter table programs add column if not exists recommended_rhythm_note text;

comment on column programs.recommended_rhythm_note is
  'Pourquoi ce rythme : texte libre du coach, affiché sous le conseil dans la popup de choix des jours.';

-- 3. Le conseil plafonne la sélection côté client : on le borne comme l'input coach (1 à 7).
alter table programs
  add constraint programs_recommended_sessions_valide
  check (recommended_sessions_per_week is null
         or recommended_sessions_per_week between 1 and 7);

-- 4. Jours d'entraînement : 0 = lundi … 6 = dimanche, sans doublon. Passe par une fonction
--    immuable parce qu'un check ne peut pas contenir de sous-requête.
create or replace function jours_semaine_valides(p smallint[])
returns boolean language sql immutable as $$
  select p is null or (
    p <@ array[0,1,2,3,4,5,6]::smallint[]
    and cardinality(p) = (select count(distinct x) from unnest(p) as x)
  );
$$;

alter table programs
  add constraint programs_athlete_days_valides
  check (jours_semaine_valides(athlete_days_of_week));

-- 5. Durée et date de fin : calculées, jamais stockées. Les séances n'ont pas de date en base,
--    elles forment une file ordonnée par order_index que le sportif peut décaler — une colonne
--    date_fin_estimee serait fausse au premier décalage.
--    security_invoker : sans lui la vue s'exécute avec les droits du propriétaire et
--    court-circuite les policies RLS de programs.
create or replace view programs_rythme_estime
with (security_invoker = on) as
select p.id as program_id,
       p.athlete_id,
       p.title,
       count(s.id)::int as total_seances,
       cardinality(p.athlete_days_of_week) as jours_par_semaine,
       case when coalesce(cardinality(p.athlete_days_of_week), 0) = 0 then null
            else ceil(count(s.id)::numeric / cardinality(p.athlete_days_of_week))::int
       end as duree_semaines_estimee,
       case when coalesce(cardinality(p.athlete_days_of_week), 0) = 0 then null
            else p.created_at
                 + (ceil(count(s.id)::numeric / cardinality(p.athlete_days_of_week))::int * interval '7 days')
       end as date_fin_estimee
  from programs p
  left join program_sessions s on s.program_id = p.id
 where p.athlete_id is not null
 group by p.id;
