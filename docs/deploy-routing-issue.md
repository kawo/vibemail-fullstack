# Resolved: engine routes misrouted on Vercel

Status: **resolved 2026-10-18** by moving the handlers from the top-level `api/` folder to
`src/endpoints/` (root cause below). Found 2026-10-17.

## Root cause

Vercel builds a top-level `api/` folder as standalone zero-config Node functions even when the
project uses the Next.js preset. A local `vercel build` showed both builders writing to the same
paths under `.vercel/output/functions/`:

- Next.js groups identically configured routes into one function and links the others to it
  (e.g. `webhook/gmail.func` → `api/v1/auth/google/callback.func`).
- The `api/` builder writes `api/v1/auth/google/callback.func` (and one folder per handler file),
  each running a single handler (`.vc-config.json`: `handler: api/v1/messages/send.js`).

The standalone functions replaced the Next.js group functions, so every route linked to a group ran
whichever single handler now sat in that folder. Which one won depended on the build, hence the
differing symptoms between deployments. With the handlers in `src/endpoints/`, only Next.js
functions are emitted, and a preview passed every check in the method matrix.
`tests/unit/nextRoutes.test.ts` now fails if a top-level `api/` folder comes back.

## What happens

Since the client and the engine share one Next.js project, the engine is served by route files
(`app/api/**/route.ts`, `app/webhook/gmail/route.ts`) that re-export the handlers in `api/`.

- **Locally it works:** `next dev` and a local production build (`next build` + `next start`) route
  every endpoint to its own handler.
- **On Vercel it doesn't** (preview deployments `vibemail-backend-ggk2cbdid-kawotte.vercel.app` and
  `vibemail-backend-rh6qa0w1h-kawotte.vercel.app`). Routes that share the same function settings
  are bundled into one function, and that function runs the wrong route's handler:

| Request | Expected | Got on Vercel |
|---|---|---|
| `POST /webhook/gmail` (no token) | `401 UNAUTHENTICATED` | `405`, `Allow: GET`: the OAuth callback's handler |
| `GET /webhook/gmail` | `405` (no GET) | `302` to `/auth/callback`: the OAuth callback ran |
| `POST /api/v1/messages/send` | `401` | `405` |
| `PATCH /api/v1/messages/{id}` | `401` | `405` |
| `POST /api/v1/messages/{id}/read` | `401` | `405` |
| `PATCH /api/v1/drafts/{id}` | `401` | `405` |
| `GET /api/v1/messages/send`, `/messages/{id}`, `/messages/{id}/read`, `/drafts/{id}` | `405` (no GET) | `401` from a GET handler |
| `GET` list, search, thread, draft list; sign-in start and callback; cron | correct | correct |

The pattern: within a group of identically configured routes, one route's module answers for all,
so only requests whose method that module also handles look right.

### Reproduced on a fresh project (2026-10-18)

`main` deployed unchanged to a new project, `vibemail-glass` (`vibemail-glass.vercel.app`, env from
the local `.env`), misroutes the same way. The project doesn't matter; the build output does. Which
module answers for a group differs from the previews, so here two more routes also break:

| Request | Expected | Got |
|---|---|---|
| `GET /api/v1/auth/google` | `302` to Google | `401`: a GET handler that requires auth, so **sign-in is impossible** |
| `POST /api/v1/drafts` | `401` | `405` |

Everything else matches the table above.

## Evidence for the grouping cause

- `/webhook/gmail` and the OAuth callback were the only two routes with `maxDuration = 60`. Giving
  the webhook `maxDuration = 90` (its own group) made it answer correctly (`401`) in the second
  preview. That change was reverted; it was a test, not a fix.
- The cron route (`maxDuration = 300`, alone in its group) works.
- Vercel documents that "routes with differing configurations are bundled separately", so
  grouping itself is expected; misrouting within a group is not.

## Hypotheses before the root cause was found (historical)

Why the grouped function dispatches to the wrong module. Leading hypotheses, untested:

1. The route files re-export from the top-level `api/` folder, which Vercel treats as a functions
   directory for non-Next projects. Test: move the handlers out of `api/` (e.g. into `src/routes/`)
   and point the route files there.
2. Pure re-export route modules (`export { POST } from …`) are handled differently by the Vercel
   Next.js builder than modules that define their handlers. Test: route files that define
   `export async function POST(request: Request) { return handler(request); }`.

## Ways forward

- Find the root cause on throwaway previews (above), fix it, then add a check that calls each route
  on a preview with a method it does and doesn't export.
- Or go back to two deployments: the engine as its own Vercel project (as in production today), and
  a Next.js rewrite proxying `/api/v1/*` to it so the client keeps relative paths.

## Related

- `.vercelignore` (added with this investigation) keeps `.env` and scratch folders out of
  `vercel deploy` uploads.
- The project lacks `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which the
  client needs to keep its session.
