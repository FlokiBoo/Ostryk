// Fiche Play Store de l'app Android (fr.ostryk.app). Tant que l'app est en bêta fermée, ce lien
// ne fonctionne que pour les comptes Google ajoutés comme testeurs dans la Play Console.
// NEXT_PUBLIC_ANDROID_APP_URL permet d'y mettre le lien d'inscription à la bêta à la place.
export const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL
  || 'https://play.google.com/store/apps/details?id=fr.ostryk.app'
