#!/usr/bin/env python3
"""Hook SessionStart (réglages utilisateur de Maxime) : repère les mouvements créés dans Ostryk qui
ne sont pas encore dans sa feuille Google « Ma Bibliothèque d'exercices », et le signale à Claude
en début de session pour qu'il les y ajoute (avec la vidéo si le mouvement en a une).

Connus = les noms de supabase/donnees/bibliotheque/biblio.txt (la feuille à l'import du
2026-11-01), + synchronises.txt (ajoutés à la feuille depuis), + hors_feuille_connus.txt (cardio
volontairement absents de la feuille). Lecture via l'API REST avec la clé publique anon : la table
movements est lisible publiquement, aucune clé d'administration n'est utilisée.

Silencieux s'il n'y a rien de nouveau ou si le réseau / .env.local manque : un hook de démarrage
ne doit jamais bloquer ni bruiter une session sans rapport avec Ostryk.
"""
import json
import urllib.request
from pathlib import Path

DEPOT = Path.home() / 'Ostryk'
DOSSIER = DEPOT / 'supabase' / 'donnees' / 'bibliotheque'
FEUILLE_ID = '1-csHXOoKfAt3mPfRLW-OX1vc6CdA7T0MKsFkfHQRESI'


def norm(s):
    return ' '.join((s or '').split()).lower()


def lire_env():
    env = {}
    for ligne in (DEPOT / '.env.local').read_text().splitlines():
        if '=' in ligne and not ligne.lstrip().startswith('#'):
            k, v = ligne.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def connus():
    noms = set()
    biblio = DOSSIER / 'biblio.txt'
    for ligne in biblio.read_text().splitlines():
        if ligne.strip():
            noms.add(norm(ligne.split('|')[1]))
    for f in ('synchronises.txt', 'hors_feuille_connus.txt'):
        p = DOSSIER / f
        if p.exists():
            noms.update(norm(l) for l in p.read_text().splitlines() if l.strip())
    return noms


def main():
    try:
        env = lire_env()
        url = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/') + '/rest/v1/movements?select=name,youtube_url,muscles,created_at&order=created_at&limit=5000'
        cle = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
        req = urllib.request.Request(url, headers={'apikey': cle, 'Authorization': f'Bearer {cle}'})
        with urllib.request.urlopen(req, timeout=8) as r:
            mouvements = json.load(r)
        deja = connus()
    except Exception:
        return

    nouveaux = [m for m in mouvements if norm(m.get('name')) not in deja]
    if not nouveaux:
        return

    lignes = '\n'.join(
        f"- {m['name']} | vidéo : {m.get('youtube_url') or 'aucune'} | muscles : {m.get('muscles') or '—'} | créé le {(m.get('created_at') or '')[:10]}"
        for m in nouveaux
    )
    contexte = f"""[Synchronisation bibliothèque Ostryk — tâche automatique de début de session]
{len(nouveaux)} mouvement(s) créé(s) dans Ostryk ne sont pas encore dans la feuille Google de Maxime « Ma Bibliothèque d'exercices » (spreadsheetId {FEUILLE_ID}) :
{lignes}

Avant ou en plus de la demande de Maxime, ajoute-les à cette feuille avec les outils Google Sheets :
1. Onglet « AJOUTS OSTRYK » (le créer s'il n'existe pas, avec l'en-tête : NOM EXERCICE | TUTO | MUSCLES | AJOUTÉ LE). Ne pas toucher aux autres onglets : Maxime y reclassera lui-même.
2. Une ligne par mouvement ; TUTO = la vidéo si elle existe, sinon vide (le mouvement apparaît déjà dans « Mouvements à filmer » du tableau de bord).
3. Puis ajoute leurs noms, un par ligne, à {DOSSIER / 'synchronises.txt'} pour ne pas les reproposer.
4. Dis-le à Maxime en une phrase (combien, lesquels)."""
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'SessionStart', 'additionalContext': contexte}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
