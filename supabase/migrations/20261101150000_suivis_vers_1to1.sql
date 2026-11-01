-- « Client suivi » et « client 1:1 » sont une seule et même chose pour le coach : le bloc
-- « Mes clients suivis » du tableau de bord lit désormais athletes.is_1to1_client.
-- Les clients cochés entre-temps via suivi_dashboard (20261101090000) passent en 1:1. La colonne
-- suivi_dashboard n'est plus lue ni écrite par l'app ; conservée (on ne supprime rien en phase de
-- test), à retirer plus tard.

update athletes set is_1to1_client = true where suivi_dashboard and not coalesce(is_1to1_client, false);

comment on column athletes.suivi_dashboard is
  'OBSOLÈTE depuis 20261101150000 : remplacé par is_1to1_client. Plus lu ni écrit par l''app.';
