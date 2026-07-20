import { createHash } from "node:crypto";
import { getEnv } from "../config/env.js";

export interface AgentSessionEntry {
  agentId: string;
  model: string;
  lastUsedAt: number;
}

const store = new Map<string, AgentSessionEntry>();
const lockTails = new Map<string, Promise<void>>();

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function buildSessionStoreKey(apiKey: string, externalSessionId: string): string {
  return `${hashApiKey(apiKey)}|${externalSessionId}`;
}

export function getAgentSession(
  apiKey: string,
  externalSessionId: string,
  model: string,
): AgentSessionEntry | undefined {
  evictExpiredSessions();
  const key = buildSessionStoreKey(apiKey, externalSessionId);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.model !== model) {
    store.delete(key);
    return undefined;
  }
  entry.lastUsedAt = Date.now();
  return entry;
}

export function setAgentSession(
  apiKey: string,
  externalSessionId: string,
  model: string,
  agentId: string,
): void {
  evictExpiredSessions();
  const key = buildSessionStoreKey(apiKey, externalSessionId);
  store.set(key, { agentId, model, lastUsedAt: Date.now() });
  enforceMaxEntries();
}

export function deleteAgentSession(apiKey: string, externalSessionId: string): void {
  store.delete(buildSessionStoreKey(apiKey, externalSessionId));
}

/** Serialize concurrent completions for the same external session. */
export async function withExternalSessionLock<T>(
  apiKey: string,
  externalSessionId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const release = await acquireExternalSessionLock(apiKey, externalSessionId);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Hold for the duration of a streaming response; call release in finally. */
export async function acquireExternalSessionLock(
  apiKey: string,
  externalSessionId: string | undefined,
): Promise<() => void> {
  if (!externalSessionId) {
    return () => {};
  }
  const key = buildSessionStoreKey(apiKey, externalSessionId);
  const previous = lockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  lockTails.set(key, tail);
  await previous;
  return release;
}

function enforceMaxEntries(): void {
  const env = getEnv();
  if (store.size <= env.agentSessionMaxEntries) return;
  const entries = [...store.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
  const toRemove = store.size - env.agentSessionMaxEntries;
  for (let i = 0; i < toRemove; i++) {
    store.delete(entries[i]![0]!);
  }
}

export function evictExpiredSessions(now = Date.now()): void {
  const env = getEnv();
  const ttlMs = env.agentSessionTtlSeconds * 1000;
  if (ttlMs <= 0) return;
  for (const [key, entry] of store) {
    if (now - entry.lastUsedAt > ttlMs) {
      store.delete(key);
    }
  }
}

/** Test-only reset. */
export function resetAgentSessionStoreForTests(): void {
  store.clear();
  lockTails.clear();
}
