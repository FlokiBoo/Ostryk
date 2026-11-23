-- Un client ne peut plus lire en direct (clé publique + sa session) un programme, une séance ou
-- des exercices masqués par le coach. Filtrer dans l'API ne suffit pas : ces trois policies lui
-- donnaient accès à toutes les lignes de ses programmes.
--
-- Les policies « coach owns … » ne changent pas : le coach continue de tout voir.
-- À exécuter APRÈS 20261123090000_visibilite_client.sql.
--
-- Ne pas faire dépendre la policy de programs d'une lecture de program_sessions : celle de
-- program_sessions lit déjà programs, la boucle provoquerait une récursion infinie.

begin;

drop policy if exists "athlete reads own programs" on programs;
create policy "athlete reads own programs" on programs
  for select
  using (
    programs.visible_client
    and exists (
      select 1 from athletes a
      where a.id = programs.athlete_id and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists "athlete reads own program_sessions" on program_sessions;
create policy "athlete reads own program_sessions" on program_sessions
  for select
  using (
    program_sessions.visible_client
    and exists (
      select 1
      from programs p
      join athletes a on a.id = p.athlete_id
      where p.id = program_sessions.program_id
        and p.visible_client
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists "athlete reads own program_exercises" on program_exercises;
create policy "athlete reads own program_exercises" on program_exercises
  for select
  using (
    exists (
      select 1
      from program_sessions ps
      join programs p on p.id = ps.program_id
      join athletes a on a.id = p.athlete_id
      where ps.id = program_exercises.program_session_id
        and ps.visible_client
        and p.visible_client
        and a.auth_user_id = auth.uid()
    )
  );

commit;
