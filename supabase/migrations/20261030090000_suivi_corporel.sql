-- Suivi corporel : poids et mensurations datés, saisis par le sportif (écran « Mon suivi corporel »)
-- ou par le coach, pour tracer des courbes sur le tableau de bord de la fiche client.
-- Jusqu'ici seul athletes.weight existait, écrasé à chaque modification : aucun historique.
-- athletes.weight reste le « poids actuel » lu ailleurs (badges, plan alimentaire) ; la route qui
-- enregistre une mesure le met à jour en même temps.
--
-- Une ligne par sportif et par jour : ressaisir le même jour corrige la mesure plutôt que
-- d'empiler des points.
--
-- À exécuter AVANT de mettre en ligne le code.

create table if not exists mesures_corporelles (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null,
  poids_kg numeric(5,1),
  masse_grasse_pct numeric(4,1),
  tour_taille_cm numeric(5,1),
  tour_hanches_cm numeric(5,1),
  tour_poitrine_cm numeric(5,1),
  tour_bras_cm numeric(5,1),
  tour_cuisse_cm numeric(5,1),
  tour_mollet_cm numeric(5,1),
  saisi_par text not null default 'athlete' check (saisi_par in ('athlete', 'coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, date)
);

create index if not exists mesures_corporelles_athlete_date_idx on mesures_corporelles (athlete_id, date);

-- Le sportif passe par /api/athlete-view/[token]/mesures (service role, contrôle dans la route).
-- Le coach lit et saisit depuis la fiche client, côté navigateur : même helper que les autres
-- tables (CLAUDE.md).
alter table mesures_corporelles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mesures_corporelles' and policyname = 'mesures_corporelles_coach') then
    create policy mesures_corporelles_coach on mesures_corporelles
      for all using (owns_athlete(athlete_id)) with check (owns_athlete(athlete_id));
  end if;
end $$;

-- Point de départ des courbes : le poids actuel du profil, daté d'aujourd'hui faute de mieux.
insert into mesures_corporelles (athlete_id, date, poids_kg, saisi_par)
select id, current_date, weight, 'athlete' from athletes where weight is not null
on conflict (athlete_id, date) do nothing;
