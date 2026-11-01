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

BIBLIO = f"""with biblio(nom, muscles, video) as (values
{valeurs}
)"""

# Mode cardio de l'éditeur (lib/raceEstimates.js, isCardioMovementName) et tests chronométrés :
# volontairement large, en cas de doute on garde.
CARDIO = "(m.name ~* '^\\s*\\d' or m.name ~* '\\m(run|bike|marathon|cooper|ski erg)\\M' or m.name ~* '^\\s*(row|ski)\\M')"

APERCU = f"""-- Bibliothèque de mouvements : on repart de zéro avec « Ma Bibliothèque d'exercices ».
-- ÉTAPE 1 / 2 : APERÇU. Ne modifie rien. À lancer en entier dans le SQL Editor de Supabase.
-- {len(uniques)} exercices uniques dans la feuille.

{BIBLIO},
supprimes as (select m.id, m.name from movements m where not {CARDIO}),
perdent_video as (
  select distinct pe.name
  from program_exercises pe
  join program_sessions ps on ps.id = pe.program_session_id
  join programs p on p.id = ps.program_id
  where coalesce(p.archived, false) = false
    and not exists (select 1 from biblio b where lower(trim(b.nom)) = lower(trim(pe.name)))
    and exists (select 1 from supprimes s where lower(trim(s.name)) = lower(trim(pe.name)))
)
select 0 as ordre, 'BILAN' as rubrique, 'Mouvements actuellement dans Ostryk' as detail, count(*)::text as nombre from movements
union all select 1, 'BILAN', 'SUPPRIMÉS (tout sauf le cardio)', count(*)::text from supprimes
union all select 2, 'BILAN', 'Gardés : cardio, vidéo retirée', count(*)::text from movements m where {CARDIO}
union all select 3, 'BILAN', 'IMPORTÉS depuis ta feuille', count(*)::text from biblio
union all select 4, 'BILAN', 'Records de clients détachés de la bibliothèque (records conservés)', count(*)::text from tracked_movements t where t.movement_id in (select id from supprimes)
union all select 5, 'BILAN', 'Exercices de programmes en cours qui perdront leur vidéo (nom absent de ta feuille)', count(*)::text from perdent_video
union all select 10, 'SUPPRIMÉ', name, '' from supprimes
union all select 20, 'GARDÉ (cardio)', m.name, '' from movements m where {CARDIO}
union all select 30, 'PERD SA VIDÉO (programme en cours)', name, '' from perdent_video
order by ordre, detail;
"""

APPLIQUER = f"""-- Bibliothèque de mouvements : on repart de zéro avec « Ma Bibliothèque d'exercices ».
-- ÉTAPE 2 / 2 : APPLICATION. Une seule transaction : en cas d'erreur, rien n'est modifié.
-- Lancer l'étape 1 (aperçu) d'abord.
--
-- Choix de Maxime (2026-11-01) : supprimer toute la bibliothèque SAUF les mouvements cardio, puis
-- importer la feuille ; seules ses vidéos (colonne TUTO) sont reprises.
--   0. sauvegarde complète de la table dans movements_sauvegarde_20261101 ;
--   1. les records des clients (tracked_movements) sont détachés de la bibliothèque, pas supprimés ;
--   2. suppression de tous les mouvements hors cardio ;
--   3. les mouvements cardio gardés perdent leur vidéo (pas celle de Maxime) ;
--   4. import des {len(uniques)} exercices de la feuille, avec vidéo et muscles.
-- Les échauffements qui citaient un mouvement supprimé gardent son nom (mouvementNom), sans vidéo.

begin;

-- 0. Sauvegarde. RLS activée sans policy : invisible depuis l'app et l'API publique.
create table movements_sauvegarde_20261101 as select * from movements;
alter table movements_sauvegarde_20261101 enable row level security;

create temp table import_source (nom text, muscles text, video text) on commit drop;
insert into import_source (nom, muscles, video) values
{valeurs};

-- 1. Records : on garde l'historique, on retire seulement le lien vers la bibliothèque
update tracked_movements set movement_id = null
where movement_id in (select m.id from movements m where not {CARDIO});

-- 2. Suppression de tout sauf le cardio
delete from coach_hidden_content
where content_type = 'movement'
  and content_id::text in (select m.id::text from movements m where not {CARDIO});

delete from movements m where not {CARDIO};

-- 3. Cardio gardé : plus de vidéo qui ne soit pas de Maxime
update movements set youtube_url = null, video_url = null;

-- 4. Import de la feuille (un nom déjà présent côté cardio reçoit la vidéo et les muscles de la feuille)
update movements m set youtube_url = s.video, video_url = null, muscles = s.muscles
from import_source s
where lower(trim(m.name)) = lower(trim(s.nom));

insert into movements (name, muscles, youtube_url, coach_id)
select s.nom, s.muscles, s.video, null
from import_source s
where not exists (select 1 from movements m where lower(trim(m.name)) = lower(trim(s.nom)));

select
  (select count(*) from movements_sauvegarde_20261101) as mouvements_avant,
  (select count(*) from movements) as mouvements_apres,
  (select count(*) from movements where coalesce(youtube_url, '') <> '') as avec_video;

commit;

-- Retour arrière complet (à lancer seul, si besoin) :
--   begin;
--   delete from movements;
--   insert into movements select * from movements_sauvegarde_20261101;
--   commit;
--   (les liens records → bibliothèque et les masquages coach_hidden_content ne sont pas restaurés)
--
-- Une fois l'import validé : drop table movements_sauvegarde_20261101;
"""

(SORTIE / 'biblio_1_apercu.sql').write_text(APERCU)
(SORTIE / 'biblio_2_appliquer.sql').write_text(APPLIQUER)

print(f'{len(lignes)} lignes lues, {len(uniques)} exercices uniques, {sum(1 for u in uniques.values() if u["video"] is None)} sans vidéo')
for d in doublons:
    print('  doublon gardé avec la 1re vidéo :', d[0])
