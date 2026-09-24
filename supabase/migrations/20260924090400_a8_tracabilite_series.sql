-- Lot A8 — qui a saisi la série, et ce qui était prescrit au moment de la saisie.
--
-- program_exercise_sets est écrite par les deux : le sportif (app/s/[token]/page.js) et le coach
-- (mode coaching de la fiche sportif). Rien ne permettait de les distinguer.

alter table program_exercise_sets
  add column if not exists entered_by_role text not null default 'athlete'
    check (entered_by_role in ('coach', 'athlete')),
  add column if not exists reps_prescribed text,
  add column if not exists kg_prescribed numeric;

comment on column program_exercise_sets.entered_by_role is
  'Qui a saisi cette série. Défaut athlete : tout l''existant vient du sportif.';
comment on column program_exercise_sets.reps_prescribed is
  'Prescription figée au moment de la saisie. Stockée plutôt que calculée : program_exercises peut '
  'changer après coup, un écart calculé à la lecture deviendrait faux rétroactivement.';
