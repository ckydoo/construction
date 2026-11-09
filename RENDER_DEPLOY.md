# Deploy MYLA to Render with Supabase

`render.yaml` is a Blueprint for a Docker web service. It no longer creates a SQLite file or a 1 GB disk — Supabase is the entire backend.

## Before you create the service

1. Have a Supabase project with `supabase/migrations/0001`–`0005` applied (`npx supabase db push`).
2. Seed it if you want the demo workspace: `npm run db:seed`.
3. Push/import this repository into `https://github.com/ckydoo/construction.git` (see `/home/user/PUSH_TO_GITHUB.md`). No push has been performed from this workspace.

## Blueprint values

Render → New → Blueprint → select the repo. `render.yaml` declares:

```yaml
services:
  - type: web
    name: myla
    runtime: docker
    plan: starter
    region: frankfurt
    healthCheckPath: /login
    envVars:
      - key: NODE_ENV              # production
      - key: STORAGE_DRIVER       # supabase
      - key: SUPABASE_STORAGE_BUCKET  # buildops-documents
      - key: NEXT_PUBLIC_APP_URL          # sync: false → paste your .onrender.com URL
      - key: NEXT_PUBLIC_SUPABASE_URL     # sync: false → https://<ref>.supabase.co
      - key: NEXT_PUBLIC_SUPABASE_ANON_KEY    # sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY        # sync: false → SECRET, server only
```

`sync: false` means Render prompts you for the value; never paste the service-role key into a `NEXT_PUBLIC_*` slot.

After the first deploy, add the `.onrender.com` URL to Supabase Auth → URL Configuration (Site URL + Redirect URLs) and set `NEXT_PUBLIC_APP_URL` accordingly.

## Local parity

```bash
cp .env.example .env        # paste the same values
npm run env:check
npm run build && npm run start:prod
```

`scripts/prod-start.mjs` refuses to start without `NEXT_PUBLIC_SUPABASE_URL` and the anon key. It does **not** create a schema — migrations are a separate, explicit step (`supabase db push`), so a bad deploy can never mutate your database implicitly.

## Verification

`GET /login` → 200 and no setup banner. Then sign in with a demo account and run the checklist in [DEPLOY.md](DEPLOY.md) §5. GitHub deployment is complete via SSH; no Render Blueprint apply, `.onrender.com` URL or public-host verification has been performed yet because those account-level changes still need explicit authorization.
