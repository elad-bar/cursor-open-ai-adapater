import { CursorAgentError } from "@cursor/sdk";
import { Hono } from "hono";
import { requireCursorApiKey } from "../auth/cursor-api-key.js";
import { listModels } from "../cursor/models.js";
import { openaiError } from "../openai/errors.js";
import { mapModelsList } from "../openai/models-mapper.js";
import { cursorAgentErrorStatus } from "../cursor/completion.js";

export const modelsRoutes = new Hono();

modelsRoutes.get("/v1/models", async (c) => {
  const apiKey = requireCursorApiKey(c);
  if (apiKey instanceof Response) return apiKey;

  try {
    const models = await listModels(apiKey);
    return c.json(mapModelsList(models));
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return c.json(
        openaiError(err.message, "api_error", err.code ?? null),
        cursorAgentErrorStatus(err) as 502,
      );
    }
    throw err;
  }
});
