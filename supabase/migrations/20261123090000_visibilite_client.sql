-- Visibilité côté client, réglée par le coach : un programme entier, ou une séance précise
-- (ex. garder les séances en autonomie visibles et masquer les séances de 1:1).
--
-- Par défaut tout reste visible : aucun programme existant ne change pour les clients.
--
-- À exécuter AVANT de mettre en ligne le code : les copies de programme écrivent visible_client,
-- et échoueraient sans la colonne.

alter table programs
  add column if not exists visible_client boolean not null default true;

alter table program_sessions
  add column if not exists visible_client boolean not null default true;

comment on column programs.visible_client is
  'false = programme invisible dans l''espace du client. Le coach le voit et le lance toujours.';
comment on column program_sessions.visible_client is
  'false = séance invisible dans l''espace du client (ex. séance de 1:1). Le coach la voit et la lance toujours.';
