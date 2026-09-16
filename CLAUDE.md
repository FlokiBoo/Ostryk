# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OSTRYK (formerly "CoachPro") is a Next.js coaching-platform SaaS for personal trainers: program building, nutrition planning, metrics/testing (mobility, force badges, cardio), messaging, and Stripe-billed athlete subscriptions. It ships as a web app (Vercel, at ostryk.fr) and, via Capacitor, as native iOS/Android shells that simply load the deployed site.

## Commands

```bash
npm run dev          # start dev server (localhost:3000)
npm run build         # production build
npm run start          # serve a production build
npm run lint            # eslint (flat config, extends eslint-config-next/core-web-vitals)
npm run cap:sync        # sync Capacitor native projects after web/plugin changes
npm run cap:ios         # open the iOS project in Xcode
npm run cap:android     # open the Android project in Android Studio
```

There is no automated test suite (no Jest/Vitest/Playwright config committed) and no staging environment: une seule base Supabase (la prod), et les commits vont directement sur `master`. Vercel crée bien une **preview deploy par branche** — c'est un front isolé, pas un environnement isolé : la preview tape sur la base de prod, les webhooks Stripe/Strava pointent toujours sur la prod, et le login y échoue tant que l'URL de preview n'est pas ajoutée aux Redirect URLs Supabase. À utiliser pour regarder une UI depuis le téléphone, jamais comme filet de sécurité. The pre-push checklist for a change is: `npx eslint <changed files>` (diff the result against a `git stash`/`git stash pop` baseline, since the repo has a number of pre-existing lint errors/warnings — only flag *new* ones), `npm run build`, then a live check against a running `npm run dev` server. For anything that needs a real session (not just a page load), the standard pattern is a scratch Playwright script that authenticates by generating a Supabase magic link server-side (`supabaseAdmin.auth.admin.generateLink`), exchanging it via `/auth/v1/verify`, and injecting the resulting session as the `sb-<project-ref>-auth-token` cookie (base64-json, `@supabase/ssr` format) — see "Auth model" below for why the cookie has to be shaped that way. Because Supabase here is the real production project, that script must create its own disposable coach/athlete (`athletes.is_test`/similar) rather than reuse or snapshot-and-restore a real row — delete everything it created once the check is done, in a `finally`/cleanup step so a crash mid-script doesn't leave test data behind. Delete these scripts from the repo root once used (`*.tmp.js`); they're scratch, not committed fixtures. We deliberately don't stand up an isolated staging DB or a PR-preview QA pipeline for this — the project's a single-coach app verified through this checklist plus ad-hoc feedback from real testers (Simon and other friends); revisit if that stops being enough (a second contributor, a much higher release cadence).

## Architecture

### Two Supabase clients, and layered authorization (RLS + application code)

- `lib/supabase.js` — browser client (`createBrowserClient`, anon key). Used directly in client components for reads/writes the current user is allowed to do. Because the anon key is public (shipped in the JS bundle), every table it can reach is only as safe as its RLS policies — RLS is the real gate here, not app code.
- `lib/supabase-admin.js` — service-role client (`supabaseAdmin`, bypasses RLS entirely). Used in almost all API routes and server-side logic (webhooks, admin actions).
- **Row Level Security is enabled and scoped on effectively every table** (verified 2026-09-01 — `supabase_schema.sql`/`supabase_nutrition_schema.sql` in the repo are stale/incomplete and should not be trusted as the source of truth for current policies; check live policies via `pg_policies` in the Supabase SQL Editor instead). Most tables use shared SQL helper functions defined in the DB: `is_admin_user()` (SECURITY DEFINER — safe to call from other policies without triggering recursive RLS on `coaches`), `is_coach()`, `is_own_or_admin(coach_id)`, `owns_athlete(athlete_id)`, `owns_athlete_coach(athlete_id)`. **When writing a new RLS policy that needs an admin/coach check, always call these helper functions — never inline a raw `EXISTS (SELECT 1 FROM coaches WHERE ...)` subquery**, which re-triggers `coaches`' own RLS and can cause `infinite recursion detected in policy for relation "coaches"`.
- For API routes, the standard pattern (see `app/api/athletes/[athleteId]/route.js`, `app/api/whoami/route.js`) is still: build a `createServerClient` from the request's cookies to identify `user` via `supabase.auth.getUser()`, then use `supabaseAdmin` to look up the `coaches`/`athletes` row and manually check ownership before doing anything. Keep following this pattern for new API routes — it's defense-in-depth on top of RLS, not a replacement for it.
- Known remaining gaps (as of 2026-09-01): `offer_requests`/`offer_purchases` have no `coach_id` column, so RLS only restricts access to "any authenticated coach", not per-coach — fine for a single-coach setup but needs a real `coach_id` + migration before onboarding a second coach who uses the one-time-offers feature. `activity_definitions`/`tracked_movements` allow any coach to write shared reference rows (no per-row ownership check) — low risk, not yet tightened.

### Auth model & middleware

`proxy.js` (Next middleware, despite the filename) gates every non-public route: it requires a Supabase session, redirects unauthenticated users to `/login`, forces first-login users (`app_metadata.needs_password`) to `/definir-mot-de-passe`, and — critically — confines athlete accounts (`app_metadata.athlete_token` set) to their own `/s/[athleteToken]` space, redirecting them out of anything else. Coach accounts have no such token and can reach the rest of the app. Public routes (webhooks, `/login`, the athlete link-based view, CGU pages, Strava OAuth) are explicitly listed at the top of `proxy.js`.

Session cookies are `@supabase/ssr` cookies named `sb-<project-ref>-auth-token`, valued as `base64-` + base64(JSON of the session object with `access_token`/`refresh_token`/`expires_at`/`user`). `proxy.js`'s cookie-forwarding logic recreates the response only *after* applying all pending cookie updates in one pass — doing it per-cookie previously caused dropped/corrupted sessions when Supabase issued multiple cookies at once (e.g. a chunked `sb-*-auth-token.0`/`.1` token).

### Two parallel training-content data models — don't mix them up

- **Legacy, day-based**: `sessions` (one row per athlete + date) and `exercises` (linked via `session_id`), defined in `supabase_schema.sql`. Used by the coach's single-day/week editor at `app/programme/[athleteId]/[date]/page.js`.
- **Newer, template-based**: `programs → program_sessions → program_exercises`, plus `program_completions`, `program_exercise_logs`, and `exercise_performance_history`. Used by the multi-week program builder at `app/programs/[athleteId]/[programId]/page.js` and consumed by the athlete-facing app at `app/s/[token]/page.js`.

Both systems are live simultaneously; check which table family a page already uses before touching reorder/CRUD logic there.

### Athlete space vs. coach space

- `app/s/[token]/page.js` (~2200 lines) is the entire athlete-facing app: a single token-scoped route (no login beyond the personal link/magic-link session), currently a long single page. A tab-bar redesign (WOD / Templates / Noter / PR / Profil, replacing the side-drawer `AthleteSidePanel`) is planned/in progress — check `.claude/` or ask before assuming the current single-page layout when working here.
- Everything else is the coach app: dashboard (`app/page.js`), athlete/program/group management, `app/movements` (exercise library), `app/nutrition`, `app/metrics`, `app/finances` (Stripe), `app/admin/coachs` (platform-admin, gated by `coaches.is_admin`), and an AI assistant (`app/assistant`, `app/api/ai/chat`, backed by `lib/anthropic.js`).

### Drag-and-drop reordering — a recurring footgun

Shared primitives live in `app/components/SortableItem.js` (`SortableGroup`/`SortableItem`/`DragHandle`, built on `@dnd-kit`). `SortableGroup`'s `handleDragEnd` translates a single drag gesture into **multiple synchronous calls** to `onReorder(id, dir)` — one per position crossed — all before the next React render. Two rules follow from this, and both have caused real bugs when violated:

1. Any `onReorder`/move handler must resolve the *current* index **inside** the `setState(prev => ...)` functional updater, keyed off a stable id — never from an index computed by the caller against outer state (that outer value is stale by the second call in the loop, since no re-render happens between them; this silently reverts/corrupts multi-step drags, especially failing on an even number of steps).
2. Persisting the new order to Supabase must not fire one write per step of the loop — concurrent unawaited requests from consecutive steps can complete out of order and leave `order_index` corrupted (duplicate/missing values) even though the on-screen result looks right. Debounce and persist the full final order once, after the drag settles.

### Styling

Tailwind (`@tailwindcss/postcss`) is configured but barely used; the overwhelming convention is inline `style={{...}}` objects referencing CSS custom properties defined in `app/globals.css` (`--bg`, `--text`, `--border`, `--green`, `--r`/`--rl` for border-radius, font variables, etc.). Match this convention rather than introducing Tailwind classes or separate stylesheets.

### External integrations

- **Stripe** — two subscription tiers defined in `lib/subscriptionTiers.js` (A: site access; B: site + weekly coach exchange), webhook at `app/api/stripe/webhook/route.js` (public, excluded from the auth middleware).
- **Strava** — OAuth connect/callback/webhook under `app/api/strava/*`, logic in `lib/strava.js`.
- **Anthropic** — AI assistant chat, `lib/anthropic.js` + `app/api/ai/chat/route.js` (requires `ANTHROPIC_API_KEY`).
- **Resend** — transactional email, `lib/email.js`.
- **Nutrition data** — CIQUAL (French food composition, bundled as `lib/data/ciqual.json`), OpenFoodFacts (`app/api/off/search`), Spoonacular (`app/api/spoonacular/search`).

### Capacitor (iOS/Android)

`capacitor.config.json` points `server.url` at the production deployment (`https://www.ostryk.fr`) rather than bundling the built app — the native shells are thin wrappers that load the live site. `ios/` and `android/` are the native project trees; run `npm run cap:sync` after changing Capacitor plugins/config, then `cap:ios`/`cap:android` to open the native IDEs.

### Path alias

`@/*` resolves to the repo root (`jsconfig.json`), e.g. `@/lib/supabase`, `@/app/components/SortableItem`.

## Développer depuis le web / le téléphone (Claude Code on the web)

Le conteneur d'une session web est cloné à neuf : `node_modules` est absent et les variables d'environnement sont celles de l'environnement Claude Code, pas celles de Vercel.

- `.claude/hooks/session-start.sh` (branché via `.claude/settings.json`) fait le `npm install` au démarrage de chaque session distante, et liste les variables d'environnement absentes. Il ne fait rien en local (`CLAUDE_CODE_REMOTE`).
- `npm run build` et `npx eslint <fichiers>` passent **sans aucune variable d'environnement** : les clients Supabase et Stripe sont instanciés à la première utilisation, pas au chargement du module (voir le commentaire en tête de `lib/supabase.js`). Ne jamais revenir à une instanciation au niveau module — c'est ce qui cassait le build des previews et des sessions web.
- En revanche, un bundle construit sans `NEXT_PUBLIC_SUPABASE_*` reste inutilisable à l'exécution : ces variables sont inlinées au build. Le build qui passe ne veut pas dire que la preview marche.
- La vérif live du checklist (script Playwright + magic link) n'est **pas** faisable depuis une session web : la policy réseau de l'environnement bloque les domaines sortants autres que les registries de paquets (`api.supabase.com`, `mcp.vercel.com` répondent 403 au CONNECT). Depuis le téléphone, le substitut est la preview Vercel de la branche — avec ses limites décrites plus haut.
- `.mcp.json` déclare le serveur MCP Supabase en lecture seule. Il démarre uniquement si `SUPABASE_PROJECT_REF` et `SUPABASE_ACCESS_TOKEN` sont définis, et uniquement là où `api.supabase.com` est joignable (poste local, ou environnement web dont la policy réseau a été élargie). `--read-only` est délibéré : la base est la prod.

## Conventions

- UI copy, code comments, and commit messages are in French. Match this when writing comments or commits in this repo.
- Comments are added sparingly and only to explain non-obvious *why* (a past bug, a race condition, a subtle ordering requirement) — see the drag-and-drop and middleware cookie-handling code for the house style.
