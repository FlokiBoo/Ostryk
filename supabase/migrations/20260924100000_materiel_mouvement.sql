-- Bibliothèque de mouvements : ajout du matériel, abandon du torque dans l'interface.
--
-- Plusieurs valeurs possibles par mouvement (une fente se fait à la barre, aux DB ou au sandbag).
-- La liste des valeurs est tenue côté app dans lib/movementEquipment.js — pas de contrainte ici,
-- pour pouvoir en ajouter sans migration.
--
-- La colonne movements.torque est conservée : plus lue ni écrite par l'app, mais on ne supprime
-- pas de données pendant la phase de test. À dropper plus tard si elle ne sert plus.

alter table movements add column if not exists equipment text[];

comment on column movements.equipment is
  'Matériel du mouvement (Barre, DB, KB, Poids du corps, Sandbag, Élastique, Sled, Medball). '
  'Valeurs définies dans lib/movementEquipment.js.';
