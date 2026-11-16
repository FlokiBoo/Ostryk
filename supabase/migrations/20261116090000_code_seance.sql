-- Code de séance choisi par le coach : SA1, SA2, SB1… (S + lettre + numéro).
--
-- Sert à repérer les séances d'une même famille dans un programme : dupliquer SA1 crée SA2, et
-- remplacer un exercice (A1, B2…) dans SA2 propose de le remplacer aussi dans SA3, SA4…
-- Le code d'exercice n'est pas stocké : il se déduit de la position (voir lib/codeSeance.js).
--
-- À exécuter AVANT de mettre en ligne le code qui lit ces colonnes (l'éditeur de séance les
-- sélectionne : sans elles, il ne s'ouvre plus).

alter table program_sessions
  add column if not exists seance_lettre text,
  add column if not exists seance_numero integer;

comment on column program_sessions.seance_lettre is
  'Lettre du code de séance (A, B, C…), sans le S. Null = séance sans code.';
comment on column program_sessions.seance_numero is
  'Numéro du code de séance (le 2 de SA2), modifiable librement par le coach.';
