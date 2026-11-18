import type { ExpoConfig } from "expo/config";
const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  "ab8338ec-2486-4f0b-abf3-6172b1d01ca7";
const config: ExpoConfig = {
  name: "MYLA Everyday",
  slug: "myla-everyday",
  version: "0.1.0",
  scheme: "myla",
  orientation: "default",
  userInterfaceStyle: "light",
  owner: process.env.EXPO_OWNER || "codzlabzim",
  android: {
    package: "zw.co.myla.everyday",
    versionCode: 1,
    permissions: ["CAMERA"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
  },
  ios: { bundleIdentifier: "zw.co.myla.everyday", supportsTablet: true },
  plugins: [
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        photosPermission: "Choose site photos to attach to your MYLA job.",
        cameraPermission: "Take site photos for your MYLA jobs.",
        microphonePermission: false,
      },
    ],
  ],
  extra: projectId ? { eas: { projectId } } : {},
  // EAS Update is deliberately not configured; preview distribution uses APK builds.
};
export default config;
