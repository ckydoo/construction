import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { apiOrigin } from "./core";

const apiRaw = process.env.EXPO_PUBLIC_API_URL;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configurationError = (() => {
  try {
    apiOrigin(apiRaw);
    if (!supabaseUrl || !publicKey)
      throw new Error("Missing public Supabase configuration.");
    if (new URL(supabaseUrl).protocol !== "https:")
      throw new Error("Supabase must use HTTPS.");
    return "";
  } catch (e: any) {
    return e.message;
  }
})();
export const origin = configurationError ? "" : apiOrigin(apiRaw);
// Chunk long JWT sessions to stay below individual SecureStore item limits.
// Generation-specific chunks + a pointer keep an interrupted write from mixing sessions.
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const safeKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");
async function discard(key: string, pointer: string | null) {
  if (!pointer) return;
  try {
    const { id, count } = JSON.parse(pointer);
    for (let i = 0; i < count; i++)
      await SecureStore.deleteItemAsync(`${key}.${id}.${i}`);
  } catch {}
}
export const secureStorage = {
  async getItem(raw: string) {
    const key = safeKey(raw),
      pointer = await SecureStore.getItemAsync(key);
    if (!pointer) return null;
    const { id, count } = JSON.parse(pointer);
    let value = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${id}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(raw: string, value: string) {
    const key = safeKey(raw),
      old = await SecureStore.getItemAsync(key),
      id = Crypto.randomUUID(),
      count = Math.ceil(value.length / 1500);
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${key}.${id}.${i}`,
        value.slice(i * 1500, (i + 1) * 1500),
        options,
      );
    await SecureStore.setItemAsync(key, JSON.stringify({ id, count }), options);
    await discard(key, old);
  },
  async removeItem(raw: string) {
    const key = safeKey(raw),
      old = await SecureStore.getItemAsync(key);
    await SecureStore.deleteItemAsync(key);
    await discard(key, old);
  },
};
export const auth = configurationError
  ? null
  : createClient(supabaseUrl!, publicKey!, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
export async function token() {
  if (!auth) throw new Error(configurationError);
  const { data, error } = await auth.auth.getSession();
  if (error || !data.session) throw new Error("Please sign in again.");
  return data.session.access_token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!path.startsWith("/api/")) throw new Error("Invalid API path.");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(origin + path, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = data.errors
        ? Object.values(data.errors)
            .filter((x) => typeof x === "string")
            .join(" ")
        : "";
      throw new ApiError(
        response.status >= 500
          ? "The service is temporarily unavailable. Please try again."
          : details || data.error || "This action is not available.",
        response.status,
      );
    }
    return data as T;
  } catch (e: any) {
    if (e.name === "AbortError")
      throw new Error("No confirmation received. Refresh before trying again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export const orgPath = (org: string, path: string) =>
  `/api/${encodeURIComponent(org)}/${path}`;
export async function receiptKey(
  userId: string,
  org: string,
  payload: unknown,
) {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(payload),
  );
  const key = `receipt.${userId}.${org}.${hash}`;
  let requestId = await SecureStore.getItemAsync(safeKey(key));
  if (!requestId) {
    requestId = Crypto.randomUUID();
    await SecureStore.setItemAsync(safeKey(key), requestId, options);
  }
  return requestId; // Retain after success too: an identical retry must not double-charge.
}
