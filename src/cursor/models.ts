import { createHash } from "node:crypto";
import { AuthenticationError, Cursor, type SDKModel } from "@cursor/sdk";
import { getEnv } from "../config/env.js";

interface CacheEntry {
  expiresAt: number;
  models: SDKModel[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function invalidateModelsCache(apiKey: string): void {
  cache.delete(cacheKey(apiKey));
}

function purgeExpiredCacheEntries(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

export async function listModels(apiKey: string): Promise<SDKModel[]> {
  const env = getEnv();
  const key = cacheKey(apiKey);
  const now = Date.now();
  purgeExpiredCacheEntries(now);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.models;
  }

  try {
    const models = await Cursor.models.list({ apiKey });
    cache.set(key, {
      models,
      expiresAt: now + env.modelsCacheTtlSeconds * 1000,
    });
    return models;
  } catch (err) {
    if (err instanceof AuthenticationError) {
      invalidateModelsCache(apiKey);
    }
    throw err;
  }
}
