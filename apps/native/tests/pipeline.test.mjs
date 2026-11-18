import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicBuildEnv, prepare } from "../scripts/prepare-ci.mjs";
import { buildSummary } from "../scripts/build-summary.mjs";
const env = {
  EXPO_OWNER: "test-owner",
  EXPO_PUBLIC_EAS_PROJECT_ID: "12345678-1234-1234-1234-123456789abc",
  EXPO_PUBLIC_API_URL: "https://example.com/",
  EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
  EXPO_TOKEN: "must-not-be-uploaded",
};
assert.equal(publicBuildEnv(env).EXPO_PUBLIC_API_URL, "https://example.com");
assert.equal(publicBuildEnv(env).EXPO_TOKEN, undefined);
for (const key of Object.keys(env).filter((k) => k !== "EXPO_TOKEN"))
  assert.throws(() => publicBuildEnv({ ...env, [key]: "" }));
for (const url of [
  "http://example.com",
  "https://user:pass@example.com",
  "https://example.com/api",
  "https://example.com/?key=x",
])
  assert.throws(() => publicBuildEnv({ ...env, EXPO_PUBLIC_API_URL: url }));
const jwt = (role) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
assert.equal(
  publicBuildEnv({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("anon") })
    .EXPO_PUBLIC_SUPABASE_ANON_KEY,
  jwt("anon"),
);
for (const key of [jwt("service_role"), "sb_secret_test", "not-a-key"])
  assert.throws(() =>
    publicBuildEnv({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: key }),
  );
const dir = mkdtempSync(join(tmpdir(), "myla-pipeline-"));
try {
  const path = join(dir, "eas.json");
  const config = JSON.parse(
    readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
  );
  writeFileSync(path, JSON.stringify(config));
  prepare(path, env);
  const next = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(next.build.production, config.build.production);
  assert.equal(next.build.preview.env.EXPO_TOKEN, undefined);
  assert.equal(readFileSync(path, "utf8").includes(env.EXPO_TOKEN), false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const finished = {
  platform: "ANDROID",
  status: "FINISHED",
  artifacts: { buildUrl: "https://expo.dev/test.apk" },
};
assert.match(buildSummary([finished]), /Download the Android APK/);
assert.throws(() => buildSummary([{ ...finished, status: "IN_QUEUE" }]));
assert.throws(() => buildSummary([]));
assert.throws(() =>
  buildSummary([
    { ...finished, artifacts: { buildUrl: "http://example.com" } },
  ]),
);
console.log(
  "Pipeline config validation, secret exclusion and build summary tests passed.",
);
