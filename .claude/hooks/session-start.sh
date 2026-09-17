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

# `npm run build` et `npx eslint` passent sans ces variables (les clients Supabase
# et Stripe sont instanciés à l'appel, pas au chargement du module). En revanche
# un serveur lancé sans elles renvoie une erreur dès la première requête.
manquantes=()
for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY; do
  [ -z "${!v:-}" ] && manquantes+=("$v")
done

if [ ${#manquantes[@]} -gt 0 ]; then
  echo "Variables d'environnement absentes : ${manquantes[*]}"
  echo "→ build et lint fonctionnent quand même ; \`npm run dev\` ne servira rien d'utile."
fi

echo "Dépendances OSTRYK installées."
