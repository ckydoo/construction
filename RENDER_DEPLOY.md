# Render deployment runbook (chosen target)

Everything in the repo is already configured: `Dockerfile`, `render.yaml`, `.dockerignore`, `scripts/prod-start.mjs`, `.env.example`.

## 1 · Get the committed repo into your GitHub/GitLab account

No GitHub connector is available in this workspace, so I can't push to your account from here. Two credential-free options:

**A — Git bundle (keeps the commit history).** Download `buildops.bundle` (in the workspace root), then locally:

```bash
git clone buildops.bundle buildops
cd buildops
git remote set-url origin https://github.com/<you>/buildops.git   # or remove origin and re-add
git branch -M main
git push -u origin main
```

**B — Source ZIP.** Download `buildops-source.zip`, unzip it, then:

```bash
cd buildops
npm install
git init && git add -A && git commit -m "BuildOps ERP"
git remote add origin https://github.com/<you>/buildops.git
git push -u origin main
```

## 2 · Create the service on Render

1. Render dashboard → **New → Blueprint** → connect your GitHub account → select the `buildops` repo.
2. Render reads `render.yaml` and creates:
   - a Docker web service named `buildops`,
   - a 1 GB persistent disk at `/app/data`,
   - `DATABASE_URL=file:/app/data/dev.db`, `UPLOAD_ROOT=/app/data/uploads`, `SEED_DEMO=true`, a generated `SESSION_SECRET`,
   - health check on `/login`.
3. Click **Apply**. First boot runs `prisma db push`, seeds 616 demo records plus the sample drawing revision chain, then serves on `$PORT`.
4. Open the `.onrender.com` URL → log in with `owner@kestrelridge.co.zw` / `Demo@1234`.

## 3 · Immediately after deploy

- [ ] Change the demo password or delete demo users in **Settings → Users**.
- [ ] Set `SEED_DEMO=false` (or leave it — it only seeds when the DB is empty).
- [ ] Add a custom domain + Render-managed TLS.
- [ ] Confirm `/login`, a record drawer, a file upload and a PDF download all work through the public domain.
- [ ] Set up disk backups (or move to Render Postgres via `npm run db:postgres`).

## 4 · Cost / limits

Starter plan + 1 GB disk is enough for a pilot. SQLite on a single instance is fine for one workspace with tens of users; for multi-instance scaling, switch to Postgres (`scripts/switch-provider.mjs`) and move `UPLOAD_ROOT` to S3/R2 — see `DEPLOY.md`.

## 5 · What I still need from you

A repo URL **and** push access (or you run step 1 locally). Once the repo is pushed, give me the Render service URL and I'll verify the live deployment end-to-end from here.
