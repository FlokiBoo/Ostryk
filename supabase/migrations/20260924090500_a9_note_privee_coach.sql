-- Lot A9 — note du coach non visible du sportif.
--
-- Trois notes existent déjà autour d'un exercice, et les trois sont lues par le sportif ou écrites
-- par lui : program_exercises.note (consigne du coach, affichée dans l'espace sportif),
-- program_exercise_logs.note (le sportif), program_sessions.coach_notes (consigne de séance).
-- Il manquait un endroit où le coach note pour lui-même.

alter table program_exercises add column if not exists private_coach_note text;
alter table program_sessions  add column if not exists private_coach_note text;

comment on column program_exercises.private_coach_note is
  'Note du coach sur cet exercice, jamais exposée à l''espace sportif. Ne pas la joindre aux '
  'select de app/s/[token] ni des routes athlete-view.';
