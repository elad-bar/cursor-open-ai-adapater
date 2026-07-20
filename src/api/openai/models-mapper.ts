import type { SDKModel } from "@cursor/sdk";
import type { ModelsListResponse } from "../types/openai.js";

export function mapModelsList(models: SDKModel[]): ModelsListResponse {
  const created = Math.floor(Date.now() / 1000);
  return {
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      object: "model",
      created,
      owned_by: "cursor",
    })),
  };
}
