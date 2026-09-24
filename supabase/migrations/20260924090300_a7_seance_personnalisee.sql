-- Lot A7 — séance personnalisée pour un seul client.
--
-- Pas de table d'override : la copie par client existe déjà, reliée au modèle par
-- source_session_id. Ce qui manquait, c'est un cran d'arrêt sur la propagation — aujourd'hui
-- propagateSessionToClients (app/programs/[athleteId]/[programId]/page.js) réécrit la copie au
-- sync, sauf si le sportif a déjà validé la séance.

alter table program_sessions add column if not exists customized_at timestamptz;

comment on column program_sessions.customized_at is
  'Séance retouchée pour ce client seul : la propagation depuis le modèle la saute. Remettre à '
  'null puis resynchroniser pour revenir à la version du programme.';
