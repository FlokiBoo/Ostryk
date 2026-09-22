# Audit schéma — spec « rythme, vente, séances coachées »

Date : 2026-09-21. Périmètre : audit seul, aucune migration appliquée.

## 1. Méthode et limites

| Source | État |
|---|---|
| `supabase/migrations/` | n'existait pas au moment de l'audit |
| Types générés | aucun (projet en JS, pas de `database.types.ts`) |
| Fichiers SQL du dépôt | 5 à la racine (`supabase_*.sql`), lancés à la main, déclarés périmés par `CLAUDE.md` |
| Base de production | lue par introspection PostgREST en lecture seule (`GET /rest/v1/`, métadonnées OpenAPI, aucune ligne de données) |

47 tables/vues en base.

**Non lu : les policies RLS.** PostgREST n'expose pas `pg_policies`. Seules les fonctions helper
sont visibles, conformes à `CLAUDE.md` : `is_admin_user`, `is_coach`, `is_own_or_admin`,
`owns_athlete`, `owns_athlete_coach`, `default_discipline_id`.

## 2. Le schéma réel, par concept

| Concept de la spec | Table réelle | Colonnes utiles |
|---|---|---|
| Sportif / client | `athletes` (34 col.) | `id`, `coach_id`, `token`, `is_1to1_client`, `is_coach`, `is_test`, `subscription_tier` |
| Programme | `programs` (30 col.) | `id`, `athlete_id`, `source_program_id`, `is_template`, `available_to_clients`, `is_self_service`, `free_sessions_count`, `duration_weeks`, `recommended_sessions_per_week`, `min_hours_between_sessions`, `athlete_days_of_week` |
| Séance d'un programme | `program_sessions` (23 col.) | `program_id`, `order_index`, `source_session_id`, `session_type`, `activity_mode`, `week_number`, `day_of_week`, `date`, `needs_sync`, `hidden_until_run` |
| Inscription d'un client | **aucune table** | l'inscription = une ligne `programs` dupliquée avec `athlete_id` + `source_program_id` (`app/api/athlete-view/[token]/available-programs/route.js:78`) |
| Planification datée | `coaching_schedule` (7 col.) | `coach_id`, `athlete_id`, `program_session_id`, `date` — date seule, pas d'heure |
| Série réalisée | `program_exercise_sets` | `program_exercise_id`, `athlete_id`, `set_index`, `reps_done` (text), `kg_done` (numeric) |
| Statut de vente | `programs.available_to_clients` + `is_self_service` + `free_sessions_count` | pas de prix, pas de date de publication |

Trois précisions qui changent la conception :

**Il n'y a pas d'inscription, il y a des copies.** Assignation coach
(`app/programs/[athleteId]/page.js:217`) et libre-service dupliquent programme + séances +
exercices. Chaque sportif possède déjà ses propres lignes. Toute colonne « de l'inscription » va
donc sur `programs`.

**Il existe déjà trois façons de dater une séance** : `program_sessions.day_of_week` (jour type),
`program_sessions.date` (séances libres, `app/api/athlete-view/[token]/free-session/route.js:39`)
et `coaching_schedule.date` (le « coaching de demain » du dashboard). En ajouter une quatrième
serait une erreur.

**Les copies clients sont réécrites par le coach.** `propagateSessionToClients`
(`app/programs/[athleteId]/[programId]/page.js:406`) retrouve la copie par `source_session_id` et
l'écrase au sync, sauf si le sportif a déjà validé la séance. C'est le point central pour (h).

## 3. Les colonnes de la spec en base

**Aucune des dix n'existe.** Rien n'a été exécuté à la main en prod. La base est cohérente avec
les fichiers du dépôt. L'écart réel est entre la spec et la base : cinq des dix colonnes demandées
existent déjà sous un nom anglais.

| Colonne de la spec | En base | L'équivalent réel |
|---|---|---|
| `type_suivi` | absent | `athletes.is_1to1_client` (boolean) |
| `en_vente` | absent | `programs.available_to_clients` (boolean) |
| `mis_en_vente_le` | absent | — |
| `seances_conseillees` | absent | `programs.recommended_sessions_per_week` (smallint) |
| `pourquoi_rythme` | absent | — |
| `jours_entrainement` | absent | `programs.athlete_days_of_week` (smallint[]) |
| `date_fin_estimee` | absent | — (calculable : `duration_weeks`, `count(program_sessions)`) |
| `mode` | absent | collision : `program_sessions.activity_mode` (`standard`/`cardio`) et `circuit_logs.mode` désignent autre chose |
| `rdv_le` | absent | `coaching_schedule.date` (date sans heure) |
| `saisi_par` | absent | — |

**Types à noter** : `athlete_days_of_week` est `smallint[]`, pas `int[]` — une contrainte
`<@ array[0,1,…]` exige un cast `::smallint[]`. Et `program_exercise_logs.kg_done` est `text`
alors que `program_exercise_sets.kg_done` est `numeric` : incohérence préexistante, hors périmètre.

## 4. Évolution par évolution

### a. Catégorie de suivi 1:1 — déjà fait, aucune migration
`athletes.is_1to1_client`, basculé par le coach depuis le menu ⋯ de la page Sportifs
(`app/athletes/page.js:168`). **Décidé : deux catégories suffisent, pas de migration.**

### b. Statut en vente + date — réutiliser, une colonne à créer
`available_to_clients` porte déjà « publié au catalogue client ». Si « en vente » = ça :

```sql
alter table programs add column if not exists listed_at timestamptz;
update programs set listed_at = created_at where available_to_clients is true and listed_at is null;
```

**Décidé : « en vente » = publication au catalogue gratuit.** L'accès reste régi par
l'abonnement et `free_sessions_count` ; `available_to_clients` est réutilisé tel quel et `listed_at`
est la seule colonne ajoutée. Pas de prix, pas de `stripe_price_id`, pas de rattachement à
`offer_purchases` (clés par `offer_key text`, sans lien vers `programs`).

### c. Séances conseillées + texte — une colonne à créer

```sql
alter table programs add column if not exists recommended_rhythm_note text;
alter table programs add constraint programs_reco_sessions_valide
  check (recommended_sessions_per_week is null or recommended_sessions_per_week between 1 and 7);
```

### d. Jours d'entraînement — rien à créer
`athlete_days_of_week smallint[]`, 0 = lundi, déjà trié et dédoublonné à l'écriture
(`app/api/athlete-view/[token]/program-days/route.js:30`). Durcissement possible, via fonction car
un `check` n'accepte pas de sous-requête :

```sql
create or replace function jours_semaine_valides(p smallint[]) returns boolean
language sql immutable as $$
  select p is null or (p <@ array[0,1,2,3,4,5,6]::smallint[]
    and cardinality(p) = (select count(distinct x) from unnest(p) as x));
$$;
```

### e. Mode autonome / coachée — à créer, sous le nom `is_coached`

```sql
alter table program_sessions add column if not exists is_coached boolean not null default false;
alter table coaching_schedule add column if not exists starts_at timestamptz;
```

`is_coached` et pas `mode` : `activity_mode` existe déjà sur la même table avec une autre
sémantique. Le rendez-vous réutilise `coaching_schedule` plutôt qu'un `rdv_le` sur la séance — la
table est faite pour ça, avec sa RLS et son index `(coach_id, date)`. Deux manques : l'heure, et
une policy SELECT pour le sportif (aujourd'hui seul le coach lit la table). « Hors de la chaîne
séquentielle » est du code : `nextUncompletedOf` dans `app/components/athlete/WodTab.js`.

### f. Trigger vente ↔ séance coachée — deux triggers, pas un
La règle porte sur le modèle (`athlete_id is null`), les copies en héritent à la duplication.

1. sur `program_sessions` : refuser `is_coached = true` si le programme est en vente ;
2. sur `programs` : refuser `available_to_clients = true` s'il existe une séance coachée.

`before insert or update`, avec `raise exception` explicite. Dépend de (b) et (e).

### g. RLS séries — non auditable en l'état
Cible : `program_exercise_sets`, écrite par les deux — le sportif (`app/s/[token]/page.js:419`) et
le coach (`app/groups/[groupId]/session/[sessionId]/page.js:108`). Policies à relire :

```sql
select tablename, policyname, cmd, qual, with_check
  from pg_policies where tablename in ('program_exercise_sets','program_sessions','programs');
```

La nouvelle policy client devra passer par un helper SECURITY DEFINER
(`is_autonomous_exercise(uuid)`), pas par un `exists` inline sur `program_sessions` — règle posée
dans `CLAUDE.md` : un sous-select dans une policy redéclenche la RLS de la table jointe.

### h. Séance personnalisée — le mécanisme existe déjà à 90 %
La copie par client est déjà une copie détachée, reliée à l'original par `source_session_id`. Ce
qui manque est un cran d'arrêt sur le sync :

```sql
alter table program_sessions add column if not exists customized_at timestamptz;
```

Le coach personnalise → `customized_at = now()`, la propagation saute ces lignes ; « supprimer la
personnalisation » = remettre à `null` et repropager depuis le modèle. **Décidé : pas de table
d'override**, qui créerait un second mécanisme concurrent du modèle de copie.

### i. Traçabilité des séries — à créer

```sql
alter table program_exercise_sets
  add column if not exists entered_by_role text not null default 'athlete'
    check (entered_by_role in ('coach','athlete')),
  add column if not exists reps_prescribed text,
  add column if not exists kg_prescribed numeric;
```

**Décidé : stocker la prescription au moment de la saisie** plutôt qu'un booléen figé. La
prescription sur `program_exercises` peut changer après coup ; l'écart se calcule à la lecture et
reste exact même si le coach retouche le programme.

### j. Note coach par exercice et par séance — déjà là, à qualifier
`program_sessions.coach_notes` et `program_exercises.note` existent et sont propagés au sync.
**Vérifié : `program_exercises.note` est affichée au sportif**, en italique sous l'exercice
(`app/s/[token]/page.js:2076` et `:2133`). C'est une consigne d'exécution, pas une note privée.
Il y a déjà trois notes distinctes autour d'un exercice :

| Champ | Auteur | Lue par |
|---|---|---|
| `program_exercises.note` | coach | le sportif (consigne) |
| `program_exercise_logs.note` | le sportif | coach et sportif (`app/s/[token]/page.js:2316`) |
| `program_sessions.coach_notes` | coach | le sportif (niveau séance) |

Une note privée coach exige donc bien une quatrième colonne, `private_coach_note`, sur
`program_exercises` et/ou `program_sessions`. Le lot A9 est maintenu. Précédent utile :
`group_session_runs.exercise_notes` (jsonb) + `coach_note`.

## 5. Découpage en lots

Numérotés « A » pour ne pas entrer en collision avec les numéros de PR GitHub du dépôt.

| Lot | Contenu | Dépend de | Risque |
|---|---|---|---|
| A0 | Créer `supabase/migrations/` et y verser l'existant | — | nul, mais c'est la cause racine : sans historique versionné, aucun audit n'est reproductible |
| A1 | (c) `recommended_rhythm_note` + contraintes (c)(d) | A0 | nul, additif |
| A2 | (a) — annulée, `is_1to1_client` reste tel quel | — | — |
| A3 | (b) `listed_at` + backfill | A1 | faible, additif |
| A4 | (e) `is_coached` + `coaching_schedule.starts_at` + policy SELECT sportif + exclusion de la chaîne dans WodTab | A1 | moyen, touche l'affichage sportif |
| A5 | (f) les deux triggers | A3 + A4 | moyen, peut bloquer des écritures existantes |
| A6 | (g) RLS séries | A4 + lecture des policies | élevé : une policy trop stricte casse la saisie en séance |
| A7 | (h) `customized_at` + garde dans `propagateSessionToClients` | A4 | moyen |
| A8 | (i) traçabilité des séries | A6 | faible, additif |
| A9 | (j) `private_coach_note` — confirmée nécessaire, `note` est visible du sportif | — | nul |

Contexte qui pèse sur tout l'ordre : une seule base, la prod, pas de staging (`CLAUDE.md`). Les
lots A5 et A6 sont les seuls qui peuvent casser une saisie en cours côté sportif ; ils méritent un
contrôle sur un compte jetable avant push.

## 6. Questions ouvertes

1. Policies RLS de `program_exercise_sets` (point g) — à relire via le MCP supabase en lecture
   seule, ou directement dans le dump du lot A0, qui contient les policies.

Les deux autres questions sont tranchées : « en vente » = catalogue gratuit (voir 4b), et
`program_exercises.note` est bien visible du sportif (voir 4j).

## 7. Décisions actées

- `is_coached`, pas `mode` (collision avec `activity_mode`).
- `coaching_schedule` + `starts_at`, pas de `rdv_le` sur la séance.
- `customized_at`, pas de table d'override.
- Prescription stockée au moment de la saisie, pas de booléen figé.
- `is_1to1_client` reste tel quel : lot A2 annulé.
- Inspection de la base par le MCP supabase en lecture seule, jamais par la clé service-role
  (règle ajoutée dans `CLAUDE.md`).
