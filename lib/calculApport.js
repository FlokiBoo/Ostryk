// Besoin calorique du calculateur d'apport client (onglet Nutrition › CalculateurApport), calé sur
// le calculateur énergétique de Julien Venesson (julienvenesson.fr, outil « calculateur
// énergétique », vérifié le 2026-11-02 en comparant ses résultats) :
//  1. métabolisme de base : équation de Harris et Benedict originale (1919), son choix par défaut ;
//  2. × coefficient d'activité (1,2 à 1,9, mêmes 5 paliers) ;
//  3. objectif en kcal fixes, pas en % : perte = maintien − 300 à − 250, prise = maintien + 250 à + 300.
// Chaque étape est arrondie comme sur le site (métabolisme arrondi avant d'appliquer le coefficient).
// Le générateur de plan repas du coach garde son propre calcul (lib/mealPlanner.js, Mifflin-St Jeor).

export const NIVEAUX_ACTIVITE = [
  { key: 'sedentaire', label: 'Sédentaire (pas ou peu d’exercice)', facteur: 1.2 },
  { key: 'leger', label: 'Légèrement actif (exercices légers ou sport 1 à 3 fois par semaine)', facteur: 1.375 },
  { key: 'modere', label: 'Modérément actif (exercices modérés 3 à 5 fois par semaine)', facteur: 1.55 },
  { key: 'tres', label: 'Très actif (exercices soutenus 6 à 7 fois par semaine)', facteur: 1.725 },
  { key: 'intense', label: 'Intensément actif (exercices intenses et métier physique)', facteur: 1.9 },
]

export const OBJECTIFS = [
  { key: 'maintenir', label: 'Maintenir mon poids', ecart: [0, 0] },
  { key: 'perdre', label: 'Perdre du poids', ecart: [-300, -250] },
  { key: 'prendre', label: 'Prendre du poids', ecart: [250, 300] },
]

// Harris et Benedict (1919). sexe : 'F' ou autre (calcul homme).
export function metabolismeDeBase(sexe, poids, taille, age) {
  return sexe === 'F'
    ? 655.0955 + 9.5634 * poids + 1.8496 * taille - 4.6756 * age
    : 66.4730 + 13.7516 * poids + 5.0033 * taille - 6.7550 * age
}

// → { metabolisme, maintien, min, max, cible } en kcal. `cible` = milieu de la fourchette conseillée.
export function besoinCalorique({ sexe, poids, taille, age, activite, objectif }) {
  const metabolisme = Math.round(metabolismeDeBase(sexe, poids, taille, age))
  const facteur = (NIVEAUX_ACTIVITE.find(n => n.key === activite) || NIVEAUX_ACTIVITE[0]).facteur
  const maintien = Math.round(metabolisme * facteur)
  const [bas, haut] = (OBJECTIFS.find(o => o.key === objectif) || OBJECTIFS[0]).ecart
  return { metabolisme, maintien, min: maintien + bas, max: maintien + haut, cible: maintien + Math.round((bas + haut) / 2) }
}
