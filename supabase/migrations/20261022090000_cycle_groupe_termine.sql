-- Cycle d'un groupe marqué « terminé » par le coach : replié en bas de la fiche groupe et retiré du
-- choix « Débuter coaching ». Purement de l'affichage côté coach, rien n'est supprimé.
--
-- Deux colonnes parce que deux sortes de cycles cohabitent sur la fiche groupe :
--   - le programme propre au groupe (programs.group_id, athlete_id null) → programs.group_finished_at ;
--   - un template lié (group_program_templates) → sur le lien, pas sur le template : le même template
--     peut être lié à plusieurs groupes et n'être terminé que dans l'un d'eux.
--
-- À exécuter AVANT de mettre en ligne le code : la fiche groupe se charge sans ces colonnes (elle
-- lit `*`), mais le bouton « Terminé » échouerait.

alter table programs
  add column if not exists group_finished_at timestamptz;

alter table group_program_templates
  add column if not exists finished_at timestamptz;

comment on column programs.group_finished_at is
  'Cycle de groupe terminé (fiche groupe côté coach). Null = en cours.';
comment on column group_program_templates.finished_at is
  'Template lié marqué terminé pour CE groupe. Null = en cours.';

-- Jusqu'ici la page ne faisait qu'insérer et supprimer des liens : rien ne garantit qu'une policy
-- UPDATE existe sur group_program_templates. On n'en crée une que s'il n'y en a aucune (UPDATE ou
-- ALL), limitée au coach propriétaire du groupe — même helper que les autres tables (CLAUDE.md).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'group_program_templates' and cmd in ('UPDATE', 'ALL')
  ) then
    create policy group_program_templates_update_own on group_program_templates
      for update
      using (exists (select 1 from groups g where g.id = group_id and is_own_or_admin(g.coach_id)))
      with check (exists (select 1 from groups g where g.id = group_id and is_own_or_admin(g.coach_id)));
  end if;
end $$;
