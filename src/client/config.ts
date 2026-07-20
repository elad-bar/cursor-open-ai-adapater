export const BRIDGE_BASE_URL = "http://127.0.0.1:8080/v1";

export interface ClientConfig {
  bridgeBaseUrl: string;
  cursorApiKey: string;
}

export function loadClientConfig(): ClientConfig {
  const cursorApiKey =
    process.env.CURSOR_API_KEY?.trim() ||
    "dev-placeholder-key";

  return {
    bridgeBaseUrl: BRIDGE_BASE_URL,
    cursorApiKey,
  };
}
