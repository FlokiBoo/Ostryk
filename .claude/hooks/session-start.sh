#!/bin/bash
# Prépare une session Claude Code sur le web : le conteneur est cloné à neuf,
# node_modules est absent, donc ni `npm run lint` ni `npm run build` ne marchent
# sans cette installation préalable.
set -euo pipefail

# En local, les dépendances sont déjà là — on ne touche à rien.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install (et non npm ci) : réutilise le node_modules du cache conteneur
# quand il existe déjà. --no-save parce que le npm du conteneur réécrit sinon
# package-lock.json (champs `libc` supprimés) et salit le diff à chaque session.
npm install --no-save --no-audit --no-fund

# `next build` instancie les clients Supabase et Stripe pendant le "collect page
# data" : sans ces variables il échoue sur un « supabaseUrl is required » ou un
# « Neither apiKey nor config.authenticator provided » qui n'ont rien à voir avec
# le code modifié. On le signale ici plutôt que de laisser chercher.
manquantes=()
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY; do
  [ -z "${!v:-}" ] && manquantes+=("$v")
done

if [ ${#manquantes[@]} -gt 0 ]; then
  echo "ATTENTION : variables d'environnement absentes : ${manquantes[*]}"
  echo "→ \`npm run build\` échouera. Les ajouter dans les réglages de l'environnement Claude Code (web)."
  echo "→ \`npx eslint <fichiers>\` fonctionne sans elles."
fi

echo "Dépendances OSTRYK installées."
