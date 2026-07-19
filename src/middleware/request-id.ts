import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const requestIdHeader = "x-request-id";

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const id = c.req.header(requestIdHeader) ?? randomUUID();
  c.set("requestId", id);
  c.header(requestIdHeader, id);
  await next();
};

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}
