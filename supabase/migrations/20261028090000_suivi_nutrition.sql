-- Suivi nutrition dans l'espace sportif : le sportif note ce qu'il mange, repas par repas, et voit
-- ses totaux de la journée face aux objectifs fixés par le coach.
--
-- Trois sources d'aliments pour la recherche :
--   - CIQUAL (lib/data/ciqual.json, embarqué, pas en base) ;
--   - la table `aliments`, partagée entre tous les sportifs et tous les coachs ;
--   - Open Food Facts, interrogé au scan d'un code-barres. Un produit trouvé y est recopié dans
--     `aliments` (source 'off') : le prochain scan ne ressort plus de chez nous.
-- Quand un produit est inconnu partout, le sportif photographie l'étiquette (nom) puis le tableau
-- des valeurs nutritionnelles ; Claude lit les deux photos, le sportif corrige si besoin, et
-- l'aliment est créé tout de suite pour tout le monde, marqué 'a_verifier' jusqu'au passage du
-- coach (Nutrition › Aliments).
--
-- À exécuter AVANT de mettre en ligne le code : l'onglet Nutrition lit et écrit ces colonnes.

-- 1. Aliments : marque, code-barres, valeurs complémentaires et traçabilité de la création.
alter table aliments
  add column if not exists marque text,
  add column if not exists code_barres text,
  add column if not exists fibres_100g numeric(5,1),
  add column if not exists sucres_100g numeric(5,1),
  add column if not exists sel_100g numeric(5,2),
  add column if not exists portion_g numeric(6,1),
  add column if not exists source text not null default 'coach',
  add column if not exists statut text not null default 'verifie',
  add column if not exists cree_par_athlete_id uuid references athletes(id) on delete set null,
  add column if not exists photo_nom_path text,
  add column if not exists photo_valeurs_path text,
  add column if not exists verifie_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aliments_source_check') then
    alter table aliments add constraint aliments_source_check check (source in ('coach', 'photo', 'off'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'aliments_statut_check') then
    alter table aliments add constraint aliments_statut_check check (statut in ('verifie', 'a_verifier'));
  end if;
end $$;

-- Un code-barres = un produit. Partiel : la plupart des aliments (créés par le coach, bruts) n'en ont pas.
create unique index if not exists aliments_code_barres_unique on aliments (code_barres) where code_barres is not null;
create index if not exists aliments_statut_idx on aliments (statut) where statut = 'a_verifier';

-- La page Aliments ne faisait qu'insérer et supprimer : rien ne garantit qu'une policy UPDATE
-- existe, or le coach corrige et valide désormais les aliments créés par les sportifs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aliments' and cmd in ('UPDATE', 'ALL')
  ) then
    create policy aliments_update_coach on aliments
      for update using (is_coach()) with check (is_coach());
  end if;
end $$;

comment on column aliments.statut is
  'verifie | a_verifier. Un aliment créé par un sportif depuis des photos est visible de tous immédiatement, mais à vérifier par le coach.';
comment on column aliments.photo_nom_path is
  'Chemin dans le bucket nutrition-etiquettes : photo du nom du produit, prise par le sportif.';
comment on column aliments.photo_valeurs_path is
  'Chemin dans le bucket nutrition-etiquettes : photo du tableau des valeurs nutritionnelles.';

-- 2. Objectifs journaliers fixés par le coach sur la fiche du sportif. Null = pas d'objectif.
alter table athletes
  add column if not exists objectif_kcal numeric(6,0),
  add column if not exists objectif_proteines numeric(5,0),
  add column if not exists objectif_glucides numeric(5,0),
  add column if not exists objectif_lipides numeric(5,0);

-- 3. Journal : une ligne par aliment mangé. Les valeurs sont figées pour la quantité saisie au
-- moment de l'ajout — corriger un aliment après coup ne réécrit pas les journées passées.
create table if not exists nutrition_journal (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  jour date not null,
  repas text not null check (repas in ('petit_dejeuner', 'dejeuner', 'collation', 'diner')),
  aliment_id uuid references aliments(id) on delete set null,
  ciqual_id text,
  nom text not null,
  quantite_g numeric(6,1) not null check (quantite_g > 0),
  kcal numeric(7,1),
  proteines numeric(6,1),
  glucides numeric(6,1),
  lipides numeric(6,1),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_journal_athlete_jour_idx on nutrition_journal (athlete_id, jour);

-- Le sportif écrit via les routes /api/athlete-view/[token]/nutrition/* (service role, contrôle
-- d'accès dans la route, comme le reste de l'espace sportif). Côté navigateur, seul le coach lit
-- le journal de ses sportifs — même helper que les autres tables (CLAUDE.md).
alter table nutrition_journal enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nutrition_journal' and policyname = 'nutrition_journal_select_coach') then
    create policy nutrition_journal_select_coach on nutrition_journal
      for select using (owns_athlete(athlete_id));
  end if;
end $$;

-- 4. Photos d'étiquettes : bucket privé. Le sportif y dépose via la route d'analyse (service
-- role) ; le coach les relit depuis Nutrition › Aliments pour vérifier un aliment.
insert into storage.buckets (id, name, public)
values ('nutrition-etiquettes', 'nutrition-etiquettes', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nutrition_etiquettes_select_coach') then
    create policy nutrition_etiquettes_select_coach on storage.objects
      for select using (bucket_id = 'nutrition-etiquettes' and is_coach());
  end if;
end $$;
