import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function buildSummary(result) {
  const builds = Array.isArray(result) ? result : [result];
  const build = builds.find((b) => b.platform === "ANDROID");
  if (!build || build.status !== "FINISHED")
    throw new Error(
      "No finished Android build was returned. Check the EAS dashboard; do not assume an APK exists.",
    );
  const raw =
    build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl;
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /[\s<>]/.test(raw)
  )
    throw new Error("EAS did not return a safe HTTPS APK URL.");
  return `## Android preview ready\n\n[Download the Android APK](<${url.href}>)\n\nOpen this link on Android and allow installation from that source. This is an internal test build, not a Play Store release.\n\nThe backend must already support mobile bearer authentication. Build success does not certify device testing.\n`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const summary = buildSummary(
    JSON.parse(readFileSync("build-result.json", "utf8")),
  );
  if (!process.env.GITHUB_STEP_SUMMARY)
    throw new Error("Missing GitHub run summary path.");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
