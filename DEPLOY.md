# MYLA deployment guide (Supabase)

The app is a Next.js 15 UI over a Supabase backend. There is **no local database, no SQLite file and no disk volume** — production needs a Supabase project with the migrations applied.

## 1. Create / connect the Supabase project

1. Create a project at supabase.com (or use the one you already have).
2. Project Settings → API: copy the **Project URL**, **anon/publishable key** and **service_role/secret key**.
3. Project Settings → General: copy the **project ref**. Project Settings → Database: copy the **database password**.
4. In Supabase Auth → Providers → Email, either disable email confirmations or configure SMTP. The registration flow expects `signInWithPassword` to return a session immediately.

## 2. Apply the schema

```bash
cd buildops
cp .env.example .env
# paste the values from step 2 into .env
npm install
npm run env:check
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push            # 0001 → 0005
npm run db:seed                 # optional: demo Auth users + 616 records + wallets + PDFs
```

`supabase db push` creates the 12 tables, the `buildops-documents` private bucket, all RLS policies and the wallet/audit RPCs. `supabase/seed.sql` is deliberately empty because demo Auth users must be created via the GoTrue Admin API, which `npm run db:seed` does.

To regenerate the RLS migration after changing `ROLE_RULES` in `src/lib/catalog.ts`:

```bash
npm run rbac:generate          # writes supabase/migrations/0003_rbac.sql
npx supabase db push
```

## 3. Environment variables in production

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key (**never** `NEXT_PUBLIC_*`) |
| `NEXT_PUBLIC_APP_URL` | public HTTPS URL of the app |
| `SUPABASE_STORAGE_BUCKET` | `buildops-documents` |
| `STORAGE_DRIVER` | `supabase` |

Add the app URL to Supabase Auth → URL Configuration → Redirect URLs / Site URL.

## 4. Run the app

```bash
npm run build
npm run start                 # next start on 0.0.0.0:3000
# or, in the container:
npm run start:prod            # validates Supabase env then starts Next
```

`Dockerfile` is a two-stage Node 20 Alpine build; it copies no `prisma/` directory and provisions no `/app/data` volume. Health check: `GET /login`.

For Render, see [RENDER_DEPLOY.md](RENDER_DEPLOY.md) and `render.yaml`. For GitHub import instructions see `/home/user/PUSH_TO_GITHUB.md` (workspace-level, not part of this repo).

### Vercel function region

`vercel.json` pins `regions: ["dub1"]` — Vercel's Dublin region, which maps to AWS `eu-west-1`, the same region as the production Supabase project. Keep the function region co-located with Supabase: every signed-in request makes several Auth and PostgREST calls, and a cross-Atlantic hop on each one adds roughly 150–250 ms. Static assets remain on Vercel's global edge regardless of this setting, and a single function region is allowed on the Hobby plan. The two `crons` entries in the same file are unaffected.

## 5. Post-deploy verification

- `GET /login` → 200, no setup notice.
- Sign in as `owner@kestrelridge.co.zw` / `Demo@1234`.
- `/kestrel-ridge/wallets` → 6 wallets, total available $11,000,000.
- `/kestrel-ridge/integrity` → `ok: true`, 0 broken refs, 0 wallet mismatches.
- Upload a PDF attachment, open it, add a revision, delete the latest.
- Sign in as `client@westgate.co.zw` → only Westgate's own records and wallet.
- `npm run audit` and `npm run audit:browser` against the deployed URL (the historical reports in this repo describe the pre-Supabase build).

## 6. Secrets hygiene

`.env` is ignored by Git and Docker. `npm run env:check` refuses secret-looking values in `NEXT_PUBLIC_*` variables and flags a tracked `.env`. Never commit a service-role key.
