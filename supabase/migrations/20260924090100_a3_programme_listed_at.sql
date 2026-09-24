-- Lot A3 — date de mise au catalogue.
--
-- "En vente" = publication au catalogue gratuit (tranché) : l'accès reste régi par l'abonnement et
-- free_sessions_count. available_to_clients porte déjà l'état, il ne manquait que la date.

alter table programs add column if not exists listed_at timestamptz;

comment on column programs.listed_at is
  'Date de publication au catalogue client. Renseignée quand available_to_clients passe à true.';

-- Rattrapage de l'existant : faute de mieux, la date de création du modèle.
update programs
   set listed_at = created_at
 where available_to_clients is true
   and listed_at is null;
