import type { MiddlewareHandler } from "hono";

import { GatewayUnavailableError, resolveUser, UnauthorizedError } from "./gateway-auth";

// Auth is delegated to the gateway: the middleware forwards the extension's
// `Authorization` (the `auth._token.local` JWT) to GET /api/user/me/, which both
// validates the token and resolves the user. The email is stashed for the route
// handler to stamp as `recorded_by` object metadata.
export const gatewayAuth: MiddlewareHandler<{
  Variables: { email: string };
}> = async (c, next) => {
  try {
    const { email } = await resolveUser(c.req.header("Authorization"));
    c.set("email", email);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (error instanceof GatewayUnavailableError) {
      return c.json({ error: "Auth gateway unavailable" }, 502);
    }

    throw error;
  }

  await next();
};
