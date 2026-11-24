# GitHub → EAS Android preview pipeline

Workflow: `.github/workflows/android-preview.yml` → **Build Android preview**.

This is a manually triggered internal APK build. It does not run on every push, submit to Google Play, publish OTA updates, or deploy Vercel. This avoids spending EAS build quota on each edit. Expo plan limits/queue times still apply.

## One-time owner setup

1. Create/link the Expo project `myla-everyday` in the intended account or organisation. Copy its actual project UUID and owner name. If the project uses a different slug, update `app.config.ts` before building.
2. Set up Android signing credentials once with `npx eas credentials --platform android` from `apps/native` on a trusted computer after logging in and linking the project. Alternatively complete a first interactive preview build. CI is non-interactive and cannot answer first-time keystore/project prompts. Preserve ownership/access to these credentials for future releases.
3. In GitHub **Settings → Environments**, create `expo-preview`. Add required reviewers if you want an approval gate, and restrict deployment branches to trusted branches. Anyone who can execute changed code on an allowed branch could access its build token.
4. Inside that environment, add the **secret** `EXPO_TOKEN`: an Expo access token for an account authorised to build this project. Create it in Expo account settings, paste it directly into GitHub, and never send it in chat or commit it. Revoke/rotate it if exposed.
5. Add these **environment variables** (not secrets; they are bundled into the APK):

| Variable | Value |
| --- | --- |
| `EXPO_OWNER` | Expo username or organisation slug |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Existing project's UUID |
| `EXPO_PUBLIC_API_URL` | HTTPS backend origin, e.g. `https://app.myla.co.zw` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL (an HTTPS origin, not a key) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The same project's public anon JWT or `sb_publishable_` key, never a service-role or `sb_secret_` key |

The GitHub environment is the source of truth **for this workflow**. `prepare-ci.mjs` validates an explicit allowlist and writes only these public values into the runner's `build.preview.env` in `eas.json`. EAS then receives them for remote bundling too. This runner-only file change is not committed. There is no need to duplicate them in EAS environment variables for this pipeline; avoid conflicting values there. Local CLI builds still use the setup in README.md.

6. Deploy the backend bearer-auth changes before attempting authenticated device tests. This workflow does not deploy or verify the backend.

## Making the workflow available

GitHub requires a `workflow_dispatch` workflow to exist on the repository's **default branch** before its Run workflow button is available. Land this workflow and the native app through the normal reviewed PR process first. Simply pushing a new workflow only to a feature branch does not guarantee it can be dispatched. No default-branch change or PR merge is performed by this implementation.

Once available:

1. Push the intended app changes.
2. Open GitHub **Actions → Build Android preview → Run workflow**.
3. Select the intended branch (all required native and backend contract-test files must be present on it).
4. Approve the `expo-preview` environment if configured.
5. Checks install locked dependencies, run native/core and pipeline tests, typecheck, and export Android JS. Only then does the authenticated EAS build job run.
6. After EAS finishes successfully, open the run summary and choose **Download the Android APK**. Open the link on an Android device and allow installation from that source. The EAS dashboard also retains build details.

The GitHub artifact `android-preview-build-<run id>` contains build metadata, not the APK. Its retention is 14 days; EAS controls APK retention. Treat installation links as internal-test distribution links, not private source-code access controls.

## Failures and boundaries

- Missing variables, privileged Supabase keys or missing `EXPO_TOKEN` fail before cloud build submission.
- If a key was placed in a public GitHub variable or appeared in logs, remove it from the variable and rotate it in Supabase; restrict access to or delete affected logs. Set the project URL and public key in their respective `expo-preview` variables before rerunning.
- Authentication/project/signing errors require owner setup; this workflow does not create accounts or silently generate signing credentials.
- If GitHub times out or a run is cancelled after submission, the remote EAS build may still run. Inspect EAS before retrying to avoid duplicate builds/charges. GitHub concurrency does not cancel a previously submitted cloud build.
- A failed/incomplete EAS result never generates a success/install summary.
- This pipeline is preview-only. Production publishing and OTA update channels are deliberately not configured.
- No authenticated cloud build has been executed during setup; local pipeline tests and native TypeScript/core checks passed. Dependency advisories and device acceptance testing remain as described in README.md.
