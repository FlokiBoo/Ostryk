-- Maintiens chronométrés (front lever, planche, L-sit…), lestés ou non.
--
-- La prescription vit déjà dans program_exercises.set_details (jsonb : `sec`, `unites`), sans
-- changement de schéma. Il manquait de quoi enregistrer la série faite : reps_done et kg_done ne
-- peuvent pas porter un temps sans le faire passer pour des répétitions dans les stats.
--
-- À exécuter AVANT de mettre en ligne le code qui écrit ces colonnes.

alter table program_exercise_sets
  add column if not exists sec_done numeric,
  add column if not exists sec_prescribed numeric;

comment on column program_exercise_sets.sec_done is
  'Temps tenu sur la série, en secondes. Null pour un exercice compté en répétitions.';
comment on column program_exercise_sets.sec_prescribed is
  'Temps prescrit figé au moment de la saisie, comme reps_prescribed / kg_prescribed (lot A8).';
