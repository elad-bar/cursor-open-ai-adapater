import { Hono } from "hono";
import type { CursorCompletionService } from "./cursor/completion.js";
import type { GatewayLogger } from "./logging.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createChatCompletionsRoutes } from "./routes/chat-completions.js";
import { healthRoutes } from "./routes/health.js";
import { modelsRoutes } from "./routes/models.js";

export interface AppDeps {
  logger: GatewayLogger;
  completionService: CursorCompletionService;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  app.route("/", healthRoutes);
  app.route("/", modelsRoutes);
  app.route("/", createChatCompletionsRoutes(deps.completionService));

  app.onError((err, c) => {
    deps.logger.error("unhandled_error", {
      request_id: c.get("requestId"),
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error: {
          message: "Internal server error",
          type: "server_error",
          param: null,
          code: null,
        },
      },
      500,
    );
  });

  return app;
}
