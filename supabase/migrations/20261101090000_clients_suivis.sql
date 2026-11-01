-- Clients « suivis » : ceux que le coach épingle sur son tableau de bord (bloc « Mes clients
-- suivis », avec la dernière séance faite avec lui). En base plutôt qu'en localStorage : le coach
-- passe du téléphone à l'ordinateur et doit retrouver la même sélection.
-- Ostryk n'a qu'un coach par sportif (athletes.coach_id) : un booléen sur le sportif suffit.
--
-- À exécuter AVANT de mettre en ligne le code.

alter table athletes
  add column if not exists suivi_dashboard boolean not null default false;

comment on column athletes.suivi_dashboard is
  'Épinglé par le coach sur son tableau de bord (bloc « Mes clients suivis »).';
