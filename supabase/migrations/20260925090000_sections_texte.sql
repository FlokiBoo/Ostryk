-- Échauffement et retour au calme rédigés avec l'éditeur à jetons (#mouvement).
-- Format : lignes ordonnées [{ "texte": … } | { "mouvementId": <movements.id>, "texte": <dose> }],
-- voir lib/sectionsTexte.js. Les anciennes données (activation / activation_videos, bloc warmup de
-- l'éditeur de séance) ne sont pas migrées : elles sont converties à la lecture tant que ces
-- colonnes sont vides.
--
-- Exécutée en prod le 2026-09-25 (SQL Editor).

alter table program_sessions
  add column if not exists warmup_content jsonb,
  add column if not exists cooldown_content jsonb;

comment on column program_sessions.warmup_content is
  'Échauffement : lignes ordonnées [{texte} | {mouvementId, texte}] (éditeur à jetons). null = pas encore rédigé dans le nouveau format : lire activation / activation_videos.';
comment on column program_sessions.cooldown_content is
  'Retour au calme : même format que warmup_content.';
