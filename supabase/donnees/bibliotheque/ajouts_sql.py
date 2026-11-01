"""Exercices ajoutés dans la feuille Google → SQL d'ajout à la bibliothèque Ostryk.

Entrée : un fichier au format de biblio.txt (ONGLET|nom|codes muscles|vidéo, vidéo = y:ID, s:ID ou -).
Sortie : SQL à coller dans le SQL Editor de Supabase — n'ajoute que les noms absents de movements,
sans tables temporaires (le SQL Editor les gère mal, voir l'import du 2026-11-01).

Usage : python3 -I ajouts_sql.py nouveaux.txt > ajouts.sql
Une fois le SQL exécuté et vérifié, ajouter les mêmes lignes à biblio.txt (copie de référence de la feuille).
"""
import sys
from pathlib import Path

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


q = lambda s: 'null' if s is None else "'" + s.replace("'", "''") + "'"
lignes = [l.split('|') for l in Path(sys.argv[1]).read_text().splitlines() if l.strip()]
valeurs = ',\n'.join(
    f"  ({q(' '.join(n.split()))}, {q(', '.join(MUSCLES[c] for c in codes.split(',')))}, {q(video(v))}::text)"
    for _, n, codes, v in lignes
)
print(f"""-- Ajout à la bibliothèque Ostryk de {len(lignes)} exercice(s) ajouté(s) dans la feuille « Ma Bibliothèque d'exercices ».
-- Seuls les noms absents de la bibliothèque sont ajoutés (relancer ce SQL ne crée pas de doublon).
insert into movements (name, muscles, youtube_url, coach_id)
select v.nom, v.muscles, v.video, null
from (values
{valeurs}
) as v(nom, muscles, video)
where not exists (select 1 from movements m where lower(trim(m.name)) = lower(trim(v.nom)));""")
