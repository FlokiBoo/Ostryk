// Données des formules d'abonnement, sans dépendance au SDK Stripe (utilisable côté client).
//
// `label`, `amount` et `priceEnv` sont consommés par Stripe (checkout, change-plan, webhook) et par
// la page Finances côté coach — ne pas les renommer. `tagline` et `benefits` ne servent qu'à la
// présentation commerciale (SubscriptionScreen) : c'est le texte de vente, il se modifie ici et
// nulle part ailleurs.
//
// ⚠️ Ces bénéfices doivent rester le reflet de ce que le code applique réellement. Aujourd'hui, la
// seule limite techniquement imposée à un compte gratuit est FREE_SESSIONS_DEFAULT ci-dessous
// (voir `shouldGateFreeTier` dans app/api/athlete-view/[token]/route.js) : tout le reste du site
// est accessible sans abonnement. Ajouter ici une promesse du type "réservé aux abonnés" sans la
// verrouiller côté serveur, c'est vendre quelque chose que l'app donne déjà.
export const FREE_SESSIONS_DEFAULT = 3

export const SUBSCRIPTION_TIERS = {
  A: {
    key: 'A',
    label: 'Accès Site',
    description: 'Accès complet au site : programmes, metrics, timer…',
    tagline: 'Pour t’entraîner en autonomie, sans rien perdre en chemin.',
    benefits: [
      'Tous les programmes du catalogue, en entier',
      'Séances illimitées, à ton rythme',
      'Suivi complet : records, badges de force, radar mobilité',
      'Séances libres, timer et bilans de séance',
      'Import automatique de tes sorties Strava',
    ],
    priceEnv: 'STRIPE_PRICE_A',
    amount: 19.99,
  },
  B: {
    key: 'B',
    label: 'Accès Site + 1 échange/semaine',
    description: 'Tout le site + un échange hebdomadaire (vidéo ou question) avec le coach',
    tagline: 'Tout l’accès, plus un vrai coach au bout du fil chaque semaine.',
    highlight: true,
    highlightLabel: 'Le plus complet',
    benefits: [
      'Tout ce que comprend l’Accès Site',
      'Un échange par semaine avec ton coach',
      'Réponses personnalisées sur ta technique',
      'Ta programmation ajustée à ton ressenti',
    ],
    priceEnv: 'STRIPE_PRICE_B',
    amount: 49.99,
  },
}

// Argumentaire affiché en tête de l'écran d'abonnement pour un compte gratuit : ce qu'il rate
// aujourd'hui, formulé côté bénéfice plutôt que côté restriction.
export const SUBSCRIPTION_PITCH = [
  { emoji: '🔓', title: 'Les programmes en entier', text: `Sans abonnement, tu t’arrêtes après ${FREE_SESSIONS_DEFAULT} séances. Avec, tu vas au bout.` },
  { emoji: '📈', title: 'Ta progression, gardée', text: 'Records, badges de force et mobilité suivis séance après séance.' },
  { emoji: '🎯', title: 'Un cadre, pas une appli de plus', text: 'Des programmes construits par ton coach, pas générés au hasard.' },
]
