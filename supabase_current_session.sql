-- Coller ce SQL dans l'éditeur SQL de ton projet Supabase

-- Ancre "séance en cours" : la dernière séance que le sportif a ouverte et pas encore validée.
-- Tant qu'elle n'est pas validée, c'est elle que la carte "Séance du jour" affiche, au lieu de
-- repartir sur la suivante du programme. Stockée sur le compte (et plus seulement en localStorage)
-- pour suivre le sportif d'un appareil à l'autre.
--
-- on delete set null : si le coach supprime la séance (ou le programme qui la porte), l'ancre
-- retombe simplement sur la progression classique au lieu de bloquer la suppression.
alter table athletes
  add column if not exists current_session_id uuid references program_sessions(id) on delete set null;

-- Pas de nouvelle policy RLS : la colonne est lue et écrite exclusivement côté serveur via le
-- client service-role (app/api/athlete-view/[token]/route.js et .../current-session/route.js),
-- qui vérifie lui-même que l'appelant est bien le sportif propriétaire du token.
