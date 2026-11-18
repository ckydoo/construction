import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const names = [
  "EXPO_OWNER",
  "EXPO_PUBLIC_EAS_PROJECT_ID",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];
export function publicBuildEnv(source) {
  const env = Object.fromEntries(
    names.map((name) => {
      const value = source[name]?.trim();
      if (!value)
        throw new Error(
          `Set ${name} in GitHub environment expo-preview variables.`,
        );
      return [name, value];
    }),
  );
  if (!/^[a-zA-Z0-9_-]+$/.test(env.EXPO_OWNER))
    throw new Error("Invalid EXPO_OWNER.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      env.EXPO_PUBLIC_EAS_PROJECT_ID,
    )
  )
    throw new Error("Use the real Expo project UUID.");
  for (const name of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL"]) {
    const url = new URL(env[name]);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        `${name} must be an HTTPS origin without a path or credentials.`,
      );
    env[name] = url.origin;
  }
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key.startsWith("sb_publishable_")) {
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
    } catch {}
    if (payload?.role !== "anon")
      throw new Error(
        "Use a public Supabase anon/publishable key, NEVER a service-role or secret key.",
      );
  }
  return env;
}
export function prepare(path = "eas.json", source = process.env) {
  const env = publicBuildEnv(source);
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (
    config.build?.preview?.android?.buildType !== "apk" ||
    config.build.preview.distribution !== "internal"
  )
    throw new Error("Preview must remain an internal APK build.");
  // Only public values are uploaded. Never spread process.env into EAS config.
  // Explicit profile env keeps remote bundling identical to local resolution.
  config.build.preview.env = { ...config.build.preview.env, ...env };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    "Public preview configuration validated. No credentials printed.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  prepare();
