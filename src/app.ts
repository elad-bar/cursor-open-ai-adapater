import { Hono } from "hono";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { chatCompletionsRoutes } from "./routes/chat-completions.js";
import { healthRoutes } from "./routes/health.js";
import { modelsRoutes } from "./routes/models.js";

export function createApp(): Hono {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  app.route("/", healthRoutes);
  app.route("/", modelsRoutes);
  app.route("/", chatCompletionsRoutes);

  app.onError((err, c) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandled_error",
        request_id: c.get("requestId"),
        error: err instanceof Error ? err.message : String(err),
      }),
    );
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
