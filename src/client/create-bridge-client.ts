import OpenAI from "openai";
import type { ClientConfig } from "./config.js";

export function createBridgeClient(config: ClientConfig): OpenAI {
  return new OpenAI({
    baseURL: config.bridgeBaseUrl,
    apiKey: config.cursorApiKey,
  });
}
