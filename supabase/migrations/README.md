# Migrations

## Comment ça marche ici

Ces fichiers sont la **référence versionnée du schéma**, pas un pipeline automatique. Il n'y a
qu'une base — la prod — et pas de staging (voir `CLAUDE.md`). Aucune commande ne les applique :
tu les exécutes à la main dans le SQL Editor de Supabase, dans l'ordre des noms de fichiers, et tu
coches la ligne correspondante ci-dessous.

Ce choix est délibéré. `supabase db push` supposerait une table d'historique
(`supabase_migrations.schema_migrations`) que la base n'a pas, et la créer écrirait en prod. Tant
que le projet tient sur un seul développeur, l'exécution manuelle coûte moins cher que
l'automatisation.

**Toute évolution du schéma passe désormais par un fichier ici.** Plus de SQL tapé directement
dans l'éditeur sans trace : c'est exactement ce qui a produit l'écart décrit dans
`docs/audit-schema-2026-09.md`.

## Nommage

`AAAAMMJJhhmmss_lot_sujet.sql`, l'horodatage de création. Format compatible avec la CLI Supabase
si on décide un jour de passer au `db push`.

## Il manque la base de référence

Le schéma actuel complet (47 tables, leurs policies, les fonctions helper) n'est pas encore dans ce
dossier : ça demande un `pg_dump --schema-only` du serveur distant, donc le mot de passe de la
base. Voir le lot A0 de `docs/audit-schema-2026-09.md`. Tant que ce dump n'est pas là, ces fichiers
décrivent les **changements** sans décrire l'état de départ.

## État

| Fichier | Lot | Exécuté en prod |
|---|---|---|
| `20260924090000_a1_rythme_programme.sql` | A1 | ☐ |
| `20260924090100_a3_programme_listed_at.sql` | A3 | ☐ |
| `20260924090200_a4_seance_coachee.sql` | A4 | ☐ |
| `20260924090300_a7_seance_personnalisee.sql` | A7 | ☐ |
| `20260924090400_a8_tracabilite_series.sql` | A8 | ☐ |
| `20260924090500_a9_note_privee_coach.sql` | A9 | ☐ |

Tous ces fichiers sont **additifs** : ils ajoutent des colonnes nullables, des contraintes qui ne
mordent que sur des valeurs hors bornes, et une policy qui élargit l'accès. Aucun ne supprime, ne
renomme, ni ne resserre un droit existant — ils peuvent donc passer pendant la phase de test
Android sans risquer d'interrompre une séance en cours.

**Les lots A5 (triggers vente ↔ séance coachée) et A6 (RLS sur les séries) ne sont volontairement
pas écrits ici.** Ce sont les deux seuls qui peuvent refuser une écriture et casser une saisie en
salle. À traiter après la phase de test, et A6 demande d'abord de relire les policies existantes.
