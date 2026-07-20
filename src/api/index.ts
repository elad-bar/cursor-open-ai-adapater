import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getAgentWorkingDirectory, getEnv } from "./config/env.js";
import { CursorCompletionService } from "./cursor/completion.js";
import { GatewayLogger } from "./logging.js";

const appLogger = new GatewayLogger("api");
const completionService = new CursorCompletionService(
  new GatewayLogger("CursorCompletionService"),
);
const env = getEnv();
const app = createApp({ logger: appLogger, completionService });

serve(
  {
    fetch: app.fetch,
    hostname: env.host,
    port: env.port,
  },
  (info) => {
    appLogger.info("server_started", {
      host: info.address,
      port: info.port,
      runtime: "local",
      cwd: getAgentWorkingDirectory(),
    });
  },
);
