# Deploying BuildOps permanently

The repo is deployment-ready: a git repository, a Dockerfile, a Render Blueprint, a production boot script and a Postgres switch script. This replaces the temporary `localhost.run` tunnel.

## 0 · Prepare the repository (already done here)

```bash
cd /home/user/buildops
git status            # clean, committed working tree
git log --oneline -1  # "BuildOps ERP: full-stack construction management"
```

To publish it, add your own remote and push (I can run the git commands here if you give me the remote URL):

```bash
git remote add origin https://github.com/<you>/buildops.git
git branch -M main && git push -u origin main
```

Or copy `buildops-source.zip` into your own repository. Note: this workspace has no connected GitHub app, so I can't push on your behalf.

> Before going public: change `SESSION_SECRET`, remove/rotate the demo accounts, and set `SEED_DEMO=false` after your first boot if you don't want the demo dataset.

## Option A — Docker + SQLite (simplest, recommended for a demo/pilot)

Works on **Render**, **Fly.io**, **Railway**, or any VPS. A persistent volume keeps `dev.db` and uploaded files.

### Render (blueprint)
1. Push the repo to GitHub.
2. Render → **New → Blueprint** → select the repo (it reads `render.yaml`).
3. It creates a web service with a 1 GB disk mounted at `/app/data`, sets `DATABASE_URL=file:/app/data/dev.db` and `UPLOAD_ROOT=/app/data/uploads`, and generates `SESSION_SECRET`.
4. First boot runs `prisma db push`, seeds 616 demo records, then starts Next on `$PORT`. Health check: `/login`.

### Any Docker host
```bash
docker build -t buildops .
docker run -d --name buildops -p 3000:3000 \
  -v buildops-data:/app/data \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e SEED_DEMO=true \
  buildops
```

### Local production run
```bash
npm run build
npm run start:prod      # applies schema, seeds if empty, serves on $PORT
```

## Option B — Postgres + Vercel / Neon / Supabase (production)

SQLite files are ephemeral on serverless, so use managed Postgres:

```bash
npm run db:postgres     # rewrites prisma/schema.prisma provider to "postgresql"
export DATABASE_URL="postgresql://USER:PASS@HOST:5432/buildops?schema=public"
export UPLOAD_ROOT="/var/buildops/uploads"   # or point at S3/R2 — see below
npx prisma generate && npx prisma db push
npm run build && npm run start:prod
```

For **Vercel**, set the same env vars in project settings and use `npm run build` as the build command; `prisma db push` should be run once as a deploy step (or replace with `prisma migrate deploy` once you generate migrations). Add `vercel.json` with a function timeout if you expect large PDF exports.

### File storage on serverless
Uploads are written to `UPLOAD_ROOT` (defaults to `<cwd>/uploads/<orgId>`). On ephemeral hosts, mount a persistent volume or swap `src/app/api/[org]/files/route.ts` and `[id]/route.ts` to write to S3/R2 — the `Attachment` model already stores file metadata, so only the two storage helpers need changing.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Prisma connection string (SQLite or Postgres) |
| `UPLOAD_ROOT` | `<cwd>/uploads` | Root directory for attached files |
| `SESSION_SECRET` | dev value | Session signing secret — **change in production** |
| `SEED_DEMO` | unset | `true` seeds 616 demo records on first boot only |
| `PORT` | `3000` | Next.js listen port |
| `NODE_ENV` | — | `production` in the container |

## What the boot script does
`scripts/prod-start.mjs` → `prisma db push --skip-generate` → optional seed if the DB has no organisation → `next start -H 0.0.0.0 -p $PORT`. It is idempotent and safe to run on every deploy.

## Data persistence
`render.yaml` mounts a 1 GB disk at `/app/data`; both `dev.db` and `UPLOAD_ROOT` live there, so records, uploaded drawings and revision chains survive redeploys. For Postgres, use managed backups plus object storage for uploads (see the note above).

## Post-deploy checklist
- [ ] Log in with `owner@kestrelridge.co.zw` / `Demo@1234`, then **change the password** (or delete demo users in Settings → Users).
- [ ] Set `SEED_DEMO=false` if you want a clean production tenant only.
- [ ] Configure a real `SESSION_SECRET` and enforce HTTPS (cookies are HTTP-only, `sameSite=lax`).
- [ ] Back up `/app/data` (SQLite) or take managed Postgres snapshots.
- [ ] Verify `/api/[org]/files` uploads and a PDF download work through the public domain.
- [ ] If exposing to the internet, put rate limiting in front of `/api/auth/login`.
