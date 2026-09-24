-- Lot A4 — séances coachées, et l'heure du rendez-vous.
--
-- is_coached et pas "mode" : program_sessions.activity_mode existe déjà avec une autre sémantique
-- (standard / cardio), et circuit_logs.mode encore une autre.
alter table program_sessions
  add column if not exists is_coached boolean not null default false;

comment on column program_sessions.is_coached is
  'Séance menée par le coach : hors de la chaîne séquentielle, planifiée à une date et une heure.';

-- Le rendez-vous réutilise coaching_schedule ("coaching de demain" du dashboard) plutôt qu'une
-- colonne sur la séance : la table est faite pour ça, avec sa RLS et son index (coach_id, date).
-- Il lui manquait l'heure.
alter table coaching_schedule add column if not exists starts_at timestamptz;

comment on column coaching_schedule.starts_at is
  'Heure du rendez-vous. La colonne date reste la clé de regroupement du dashboard.';

-- Aujourd'hui seul le coach lit coaching_schedule : le sportif ne verrait pas son propre
-- rendez-vous. Cette policy élargit l'accès, elle n'en retire aucun.
-- owns_athlete(athlete_id) est la fonction SECURITY DEFINER partagée du projet (cf. CLAUDE.md) :
-- ne pas inliner de sous-requête EXISTS, ça redéclencherait la RLS de la table jointe.
create policy "athlete reads own coaching_schedule"
  on coaching_schedule for select
  using (owns_athlete(athlete_id));
