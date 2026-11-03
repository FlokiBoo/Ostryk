"""« Ma Bibliothèque d'exercices » (Google Sheets) → deux scripts SQL pour la table movements.

biblio.txt : ONGLET|nom|codes muscles|vidéo
  vidéo : y:ID = https://youtu.be/ID, s:ID = https://youtube.com/shorts/ID, - = pas de tuto de Maxime
  (seule la colonne TUTO de la feuille est reprise, et seulement si la vidéo est sur la chaîne
  @Ms_Coachingg ; un exercice sans vidéo de Maxime n'est pas importé du tout).

Usage : python3 -I generer.py <dossier de sortie>
"""
import sys
from collections import OrderedDict
from datetime import date
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
        # Même nom dans deux onglets : on garde la ligne qui a une vidéo de Maxime.
        if uniques[cle]['video'] is None and video(vid) is not None:
            uniques[cle] = {'nom': uniques[cle]['nom'], 'muscles': muscles, 'video': video(vid)}
        doublons.append(nom)
        continue
    uniques[cle] = {'nom': nom, 'muscles': muscles, 'video': video(vid)}

# Choix de Maxime (2026-11-03) : seuls les exercices avec une vidéo de sa chaîne entrent dans
# Ostryk ; ceux avec une vidéo d'une autre chaîne (HTS) ou sans vidéo restent dans la feuille seulement.
ecartes = [u['nom'] for u in uniques.values() if u['video'] is None]
uniques = OrderedDict((k, u) for k, u in uniques.items() if u['video'] is not None)

q = lambda s: 'null' if s is None else "'" + s.replace("'", "''") + "'"
valeurs = ',\n'.join(f"  ({q(u['nom'])}, {q(u['muscles'])}, {q(u['video'])}::text)" for u in uniques.values())
nb_sans = len(ecartes)
SAUVEGARDE = 'movements_sauvegarde_' + date.today().strftime('%Y%m%d')

# Pas de table temporaire : le SQL Editor de Supabase les gère mal (erreur « import_source does not
# exist » au 2e lancement lors de l'import du 2026-11-01). La feuille est répétée en CTE.
BIBLIO = f"""with biblio(nom, muscles, video) as (values
{valeurs}
)"""

APERCU = f"""-- Bibliothèque de mouvements : on repart de zéro avec « Ma Bibliothèque d'exercices ».
-- ÉTAPE 1 / 2 : APERÇU. Ne modifie rien. À lancer en entier dans le SQL Editor de Supabase.
-- {len(uniques)} exercices importés (vidéo de Maxime) ; {nb_sans} exercices de la feuille écartés (vidéo HTS ou pas de vidéo).

{BIBLIO},
perdent_lien as (
  select distinct pe.name
  from program_exercises pe
  join program_sessions ps on ps.id = pe.program_session_id
  join programs p on p.id = ps.program_id
  where coalesce(p.archived, false) = false
    and not exists (select 1 from biblio b where lower(trim(b.nom)) = lower(trim(pe.name)))
)
select 0 as ordre, 'BILAN' as rubrique, 'Mouvements actuellement dans Ostryk (tous supprimés)' as detail, count(*)::text as nombre from movements
union all select 1, 'BILAN', 'IMPORTÉS depuis ta feuille', count(*)::text from biblio
union all select 2, 'BILAN', 'Exercices de ta feuille écartés (vidéo HTS ou pas de vidéo)', '{nb_sans}'
union all select 4, 'BILAN', 'Records de clients détachés de la bibliothèque (records conservés)', count(*)::text from tracked_movements where movement_id is not null
union all select 5, 'BILAN', 'Exercices de programmes en cours dont le nom n''est pas dans ta feuille (gardés, sans vidéo)', count(*)::text from perdent_lien
union all select 30, 'PROGRAMME EN COURS — NOM ABSENT DE TA FEUILLE', name, '' from perdent_lien
order by ordre, detail;
"""

APPLIQUER = f"""-- Bibliothèque de mouvements : on repart de zéro avec « Ma Bibliothèque d'exercices ».
-- ÉTAPE 2 / 2 : APPLICATION. Une seule transaction : en cas d'erreur, rien n'est modifié.
-- Lancer l'étape 1 (aperçu) d'abord.
--
-- Choix de Maxime (2026-11-03) : tout supprimer (cardio compris), puis importer de la feuille UNIQUEMENT
-- les exercices dont la vidéo est sur sa chaîne YouTube @Ms_Coachingg. Vidéo d'une autre chaîne (HTS)
-- ou pas de vidéo : l'exercice n'est pas importé.
--   0. sauvegarde complète de la table dans {SAUVEGARDE} ;
--   1. les records des clients (tracked_movements) sont détachés de la bibliothèque, pas supprimés ;
--   2. suppression de tous les mouvements ;
--   3. import des {len(uniques)} exercices de la feuille qui ont une vidéo de Maxime, avec muscles et vidéo.
-- Les programmes gardent leurs exercices (ils sont stockés par nom), seule la vidéo dépend de la bibliothèque.

begin;

-- 0. Sauvegarde. RLS activée sans policy : invisible depuis l'app et l'API publique.
create table {SAUVEGARDE} as select * from movements;
alter table {SAUVEGARDE} enable row level security;

-- 1. Records : on garde l'historique, on retire seulement le lien vers la bibliothèque
update tracked_movements set movement_id = null where movement_id is not null;

-- 2. Suppression de toute la bibliothèque
delete from coach_hidden_content where content_type = 'movement';
delete from movements;

-- 3. Import de la feuille
insert into movements (name, muscles, youtube_url, video_url, coach_id)
select b.nom, b.muscles, b.video, null, null
from (values
{valeurs}
) as b(nom, muscles, video);

select
  (select count(*) from {SAUVEGARDE}) as mouvements_avant,
  (select count(*) from movements) as mouvements_apres,
  (select count(*) from movements where coalesce(youtube_url, '') <> '') as avec_video;

commit;

-- Retour arrière complet (à lancer seul, si besoin) :
--   begin;
--   delete from movements;
--   insert into movements select * from {SAUVEGARDE};
--   commit;
--   (les liens records → bibliothèque et les masquages coach_hidden_content ne sont pas restaurés)
--
-- Une fois l'import validé : drop table {SAUVEGARDE};
"""

(SORTIE / 'biblio_1_apercu.sql').write_text(APERCU)
(SORTIE / 'biblio_2_appliquer.sql').write_text(APPLIQUER)

print(f'{len(lignes)} lignes lues, {len(uniques)} exercices importés, {nb_sans} écartés (vidéo HTS ou sans vidéo)')
for d in doublons:
    print('  doublon (même nom dans deux onglets) :', d)
