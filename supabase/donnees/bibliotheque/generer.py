"""« Ma Bibliothèque d'exercices » (Google Sheets) → deux scripts SQL pour la table movements.

biblio.txt : ONGLET|nom|codes muscles|vidéo
  vidéo : y:ID = https://youtu.be/ID, s:ID = https://youtube.com/shorts/ID, - = pas de tuto de Maxime
  (seule la colonne TUTO de la feuille est reprise : jamais Instagram ni un autre youtubeur).

Usage : python3 -I generer.py <dossier de sortie>
"""
import sys
from collections import OrderedDict
from pathlib import Path

ICI = Path(__file__).parent
SORTIE = Path(sys.argv[1]) if len(sys.argv) > 1 else ICI

# Libellés choisis pour être reconnus par parseMusclesFromText (app/components/CelebrationModal.js).
# « Préhension » plutôt que « Avant-bras » : 'bras' déclencherait aussi biceps.
MUSCLES = {
    'Q': 'Quadriceps', 'F': 'Fessiers', 'IJ': 'Ischio-jambiers', 'L': 'Lombaires',
    'GD': 'Grand dorsal', 'T': 'Trapèzes', 'P': 'Pectoraux', 'E': 'Épaules', 'B': 'Biceps',
    'Tr': 'Triceps', 'AB': 'Préhension', 'A': 'Abdominaux', 'O': 'Obliques', 'AD': 'Adducteurs',
    'M': 'Mollets', 'TA': 'Tibial antérieur', 'PS': 'Psoas', 'PI': 'Pieds', 'C': 'Cou',
}


def video(v):
    if v == '-':
        return None
    if v.startswith('y:'):
        return 'https://youtu.be/' + v[2:]
    if v.startswith('s:'):
        return 'https://youtube.com/shorts/' + v[2:]
    return v


lignes = [l.split('|') for l in (ICI / 'biblio.txt').read_text().splitlines() if l.strip()]
uniques = OrderedDict()
doublons = []
for onglet, nom, codes, vid in lignes:
    nom = ' '.join(nom.split())
    muscles = ', '.join(MUSCLES[c] for c in codes.split(','))
    cle = nom.lower()
    if cle in uniques:
        if uniques[cle]['video'] != video(vid):
            doublons.append((nom, uniques[cle]['video'], video(vid)))
        continue
    uniques[cle] = {'nom': nom, 'muscles': muscles, 'video': video(vid)}

q = lambda s: 'null' if s is None else "'" + s.replace("'", "''") + "'"
valeurs = ',\n'.join(f"  ({q(u['nom'])}, {q(u['muscles'])}, {q(u['video'])}::text)" for u in uniques.values())

CTE = f"""with biblio(nom, muscles, video) as (values
{valeurs}
),
existants as (
  select m.id, m.name,
    exists (select 1 from biblio b where lower(trim(b.nom)) = lower(trim(m.name))) as dans_biblio,
    -- Mode cardio de l'éditeur (lib/raceEstimates.js, isCardioMovementName) et tests chronométrés :
    -- volontairement large, en cas de doute on garde.
    (m.name ~* '^\\s*\\d' or m.name ~* '\\m(run|bike|marathon|cooper|ski erg)\\M' or m.name ~* '^\\s*(row|ski)\\M') as cardio,
    exists (select 1 from tracked_movements t where t.movement_id = m.id) as records,
    exists (
      select 1 from program_sessions ps
      cross join lateral jsonb_array_elements(
        (case when jsonb_typeof(ps.warmup_content) = 'array' then ps.warmup_content else '[]'::jsonb end)
        || (case when jsonb_typeof(ps.cooldown_content) = 'array' then ps.cooldown_content else '[]'::jsonb end)
      ) l
      where l->>'mouvementId' = m.id::text
    ) as echauffements
  from movements m
)"""

APERCU = f"""-- Bibliothèque de mouvements ← « Ma Bibliothèque d'exercices » (Google Sheets)
-- ÉTAPE 1 / 2 : APERÇU. Ne modifie rien. À lancer en entier dans le SQL Editor de Supabase.
-- {len(uniques)} exercices uniques dans la feuille. Résultat : le bilan chiffré, puis le détail
-- nom par nom.

{CTE},
a_supprimer as (
  select * from existants where not dans_biblio and not cardio and not records and not echauffements
),
perdent_video as (
  select distinct pe.name
  from program_exercises pe
  join program_sessions ps on ps.id = pe.program_session_id
  join programs p on p.id = ps.program_id
  where coalesce(p.archived, false) = false
    and exists (select 1 from a_supprimer e where lower(trim(e.name)) = lower(trim(pe.name)))
),
a_ajouter as (
  select b.nom from biblio b where not exists (select 1 from movements m where lower(trim(m.name)) = lower(trim(b.nom)))
)
select 0 as ordre, 'BILAN' as rubrique, 'Mouvements actuellement dans Ostryk' as detail, count(*)::text as nombre from existants
union all select 1, 'BILAN', 'Déjà dans ta feuille (vidéo et muscles remplacés par ceux de la feuille)', count(*)::text from existants where dans_biblio
union all select 2, 'BILAN', 'À SUPPRIMER', count(*)::text from a_supprimer
union all select 3, 'BILAN', 'Gardés : cardio (Run/Row/Ski/Bike, tests chronométrés) — vidéo retirée', count(*)::text from existants where not dans_biblio and cardio
union all select 4, 'BILAN', 'Gardés : liés aux records des sportifs — vidéo retirée', count(*)::text from existants where not dans_biblio and not cardio and records
union all select 5, 'BILAN', 'Gardés : cités dans un échauffement / retour au calme — vidéo retirée', count(*)::text from existants where not dans_biblio and not cardio and not records and echauffements
union all select 6, 'BILAN', 'À AJOUTER', count(*)::text from a_ajouter
union all select 7, 'BILAN', 'Exercices de programmes en cours qui perdront leur vidéo', count(*)::text from perdent_video
union all select 8, 'BILAN', 'Exercices de ta feuille sans tuto à toi (importés sans vidéo)', count(*)::text from biblio where video is null
union all select 10, 'SUPPRIMÉ', name, '' from a_supprimer
union all select 20, 'GARDÉ (cardio)', name, '' from existants where not dans_biblio and cardio
union all select 21, 'GARDÉ (records)', name, '' from existants where not dans_biblio and not cardio and records
union all select 22, 'GARDÉ (échauffement)', name, '' from existants where not dans_biblio and not cardio and not records and echauffements
union all select 30, 'PERD SA VIDÉO (programme en cours)', name, '' from perdent_video
union all select 40, 'AJOUTÉ', nom, '' from a_ajouter
union all select 50, 'SANS VIDÉO (pas de tuto à toi)', nom, '' from biblio where video is null
order by ordre, detail;
"""

APPLIQUER = f"""-- Bibliothèque de mouvements ← « Ma Bibliothèque d'exercices » (Google Sheets)
-- ÉTAPE 2 / 2 : APPLICATION. Une seule transaction : en cas d'erreur, rien n'est modifié.
-- Lancer l'étape 1 (aperçu) d'abord et vérifier les chiffres.
--
-- La feuille fait foi, et seules les vidéos de Maxime (colonne TUTO) sont reprises :
--   0. sauvegarde complète de la table dans movements_sauvegarde_20261030 ;
--   1. supprime les mouvements absents de la feuille, SAUF ceux du mode cardio, ceux liés aux
--      records des sportifs (tracked_movements) et ceux cités dans un échauffement / retour au
--      calme — ceux-là sont gardés mais leur vidéo est retirée ;
--   2. remplace vidéo et muscles des mouvements présents dans la feuille (video_url, l'ancien
--      champ vidéo, est vidé : l'app l'affiche en repli) ;
--   3. ajoute les mouvements de la feuille qui manquent.
-- Comparaison des noms sans tenir compte des majuscules ni des espaces en trop.

begin;

-- 0. Sauvegarde. RLS activée sans policy : invisible depuis l'app et l'API publique.
--    Retour arrière, ou suppression une fois l'import validé : voir en bas du fichier.
create table movements_sauvegarde_20261030 as select * from movements;
alter table movements_sauvegarde_20261030 enable row level security;

create temp table import_biblio on commit drop as
{CTE}
select * from existants;

create temp table import_source (nom text, muscles text, video text) on commit drop;
insert into import_source (nom, muscles, video) values
{valeurs};

-- 1. Suppressions
delete from coach_hidden_content
where content_type = 'movement'
  and content_id::text in (select id::text from import_biblio where not dans_biblio and not cardio and not records and not echauffements);

delete from movements
where id in (select id from import_biblio where not dans_biblio and not cardio and not records and not echauffements);

-- Gardés hors feuille : plus de vidéo qui ne soit pas de Maxime
update movements set youtube_url = null, video_url = null
where id in (select id from import_biblio where not dans_biblio);

-- 2. La feuille écrase vidéo et muscles
update movements m set youtube_url = s.video, video_url = null, muscles = s.muscles
from import_source s
where lower(trim(m.name)) = lower(trim(s.nom));

-- 3. Ajouts (bibliothèque commune : coach_id null, comme une création par l'admin)
insert into movements (name, muscles, youtube_url, coach_id)
select s.nom, s.muscles, s.video, null
from import_source s
where not exists (select 1 from movements m where lower(trim(m.name)) = lower(trim(s.nom)));

select
  (select count(*) from movements_sauvegarde_20261030) as mouvements_avant,
  (select count(*) from movements) as mouvements_apres,
  (select count(*) from movements m join import_source s on lower(trim(m.name)) = lower(trim(s.nom))) as issus_de_la_feuille,
  (select count(*) from movements where coalesce(youtube_url, '') <> '') as avec_video;

commit;

-- Retour arrière complet (à lancer seul, si besoin) :
--   begin;
--   delete from movements where id not in (select id from movements_sauvegarde_20261030);
--   insert into movements select * from movements_sauvegarde_20261030 s where not exists (select 1 from movements m where m.id = s.id);
--   update movements m set name = s.name, muscles = s.muscles, youtube_url = s.youtube_url, video_url = s.video_url
--     from movements_sauvegarde_20261030 s where m.id = s.id;
--   commit;
--   (les masquages coach_hidden_content supprimés ne sont pas restaurés)
--
-- Une fois l'import validé : drop table movements_sauvegarde_20261030;
"""

(SORTIE / 'biblio_1_apercu.sql').write_text(APERCU)
(SORTIE / 'biblio_2_appliquer.sql').write_text(APPLIQUER)

print(f'{len(lignes)} lignes lues, {len(uniques)} exercices uniques, {sum(1 for u in uniques.values() if u["video"] is None)} sans vidéo')
for d in doublons:
    print('  doublon gardé avec la 1re vidéo :', d[0])
