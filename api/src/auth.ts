import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const safeEquals = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

// Fail-closed: with no API_TOKEN configured every request is rejected.
export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const token = process.env.API_TOKEN;
  const header = c.req.header("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token == null || token === "" || !safeEquals(provided, token)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
