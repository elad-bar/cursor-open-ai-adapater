import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getAgentWorkingDirectory, getEnv } from "./config/env.js";

const env = getEnv();
const app = createApp();

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
