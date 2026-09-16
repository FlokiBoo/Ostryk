# TODO

Tâches identifiées mais pas encore traitées, à reprendre en session.

## Prochaine étape
- [ ] **Améliorer le goniomètre** (mesure d'angle par photo, `app/movements` ou équivalent) — priorité annoncée le 2026-09-03.

## Backlog
- [ ] Réduire la liste des PR dans l'onglet Records (`app/components/TrackedMovementsBlock.js`) — quoi exactement à préciser avec l'utilisateur (moins de mouvements par défaut ? suppression de mouvements précis ? moins de catégories ?).
- [ ] Avant de connecter l'assistant IA (`app/api/ai/chat`) ou le générateur de repas (`lib/mealPlanner.js`) à un vrai backend IA : ajouter un rate limiting (remonté en revue sécurité pré-lancement, endpoint à coût si non protégé).
- [ ] Mettre l'app native en ligne sur le Google Play Store — bêta fermée en cours de lancement (2026-09-15) avant la mise en ligne publique.
- [ ] Ajouter un mode "Cardio" sous "Add exercise" et "Circuit" (éditeur de séance, blocs).
- [ ] Faire la DA (direction artistique) du site.
- [ ] Dans la recherche d'exercice (éditeur de séance), rendre l'étoile à côté du "+" fonctionnelle : cliquer dessus ajoute le mouvement aux favoris, retrouvable ensuite dans l'onglet "Favorites".
- [ ] **Séance libre côté athlète** : un client qui crée sa propre séance doit pouvoir, comme le coach, créer un mouvement à la volée — mais celui-ci est privé (visible seulement pour lui, dans "My Exercises"), pas partagé avec le coach ni les autres athlètes. Chaque mouvement perso doit avoir un historique comme n'importe quel mouvement du catalogue. Nécessite un constructeur de séance côté athlète (app/s/[token]) qui n'existe pas encore — chantier à part de l'éditeur de séance coach en cours.
- [ ] Améliorer la vue séance du client.
- [ ] Améliorer la vue coach avec retour client.
- [ ] **Écran de préparation du player de séance** (`app/s/[token]/page.js`, `SessionCard` en `playerMode`) : reprendre une par une les fonctions annexes qui y sont restées telles quelles lors de l'ajout du player exercice-par-exercice (report/skip, circuits, notes coach, allures course à pied, verrou abonnement, séances récurrentes/groupe, matériel) pour voir comment chacune s'articule mieux avec le nouveau flow — explicitement non retravaillé dans ce lot, à la demande de l'utilisateur.
- [ ] Synchro automatique des activités Strava dans l'app (mise à jour auto, pas d'import manuel).
