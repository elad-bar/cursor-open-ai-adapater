import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getAgentWorkingDirectory, getEnv } from "./config/env.js";
import { evictExpiredSessions } from "./session/agent-session-store.js";

const env = getEnv();
const app = createApp();

const sessionSweepMs = Math.min(
  Math.max(env.agentSessionTtlSeconds * 1000, 60_000),
  300_000,
);
setInterval(() => {
  evictExpiredSessions();
}, sessionSweepMs).unref();

serve(
  {
    fetch: app.fetch,
    hostname: env.host,
    port: env.port,
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "server_started",
        host: info.address,
        port: info.port,
        runtime: "local",
        cwd: getAgentWorkingDirectory(),
      }),
    );
  },
);
