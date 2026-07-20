import type { Context } from "hono";
import { getEnv } from "../config/env.js";

export function resolveExternalSessionId(
  c: Context,
  bodyUser: string | undefined,
): string | undefined {
  const env = getEnv();
  if (env.agentSessionHeader) {
    const fromHeader = c.req.header(env.agentSessionHeader)?.trim();
    if (fromHeader) return fromHeader;
  }
  const fromUser = bodyUser?.trim();
  if (fromUser) return fromUser;
  return undefined;
}
