-- Phase du programme sur chaque séance (P1, P2…), saisie par le coach devant le code de séance :
-- « P1 · SA1 · texte libre ». La duplication et le report d'exercice restent dans la même phase.
--
-- À exécuter AVANT de mettre en ligne le code : l'éditeur de séance sélectionne cette colonne,
-- sans elle il ne s'ouvre plus.

alter table program_sessions
  add column if not exists phase_numero integer;

comment on column program_sessions.phase_numero is
  'Numéro de phase du programme (le 1 de P1), libre. Null = séance sans phase.';
