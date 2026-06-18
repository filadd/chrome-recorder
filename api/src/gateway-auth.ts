// The stand-in does no JWT crypto of its own: the gateway owns token validation.
// Forwarding the extension's `Authorization` to GET /api/user/me/ both validates
// the token (gateway rejects an invalid one) and resolves the user — the gateway
// decodes the JWT, injects X-UserId, and users-api returns the user incl. email.
// MUST be the gateway URL, never users-api directly (that would bypass auth).

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class GatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayUnavailableError";
  }
}

const gatewayUrl = (): string => {
  const url = process.env.GATEWAY_URL;

  if (url == null || url === "") {
    throw new Error("GATEWAY_URL is not configured");
  }

  return url.replace(/\/$/, "");
};

// users-api returns the flat ExpandedUserSchema when an X-Api-Version header is
// present, and the legacy `{ user: {...} }` wrapper otherwise. The stand-in sends
// no version header, so the wrapped shape is the default — try it first.
interface MeResponse {
  email?: string;
  user?: { email?: string };
}

export const resolveUser = async (authorization: string | undefined): Promise<{ email: string }> => {
  if (authorization == null || authorization.trim() === "") {
    throw new UnauthorizedError("Missing Authorization header");
  }

  let res: Response;

  try {
    res = await fetch(`${gatewayUrl()}/api/user/me/`, {
      headers: { Authorization: authorization },
    });
  } catch (error) {
    throw new GatewayUnavailableError(`Gateway unreachable: ${error}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new UnauthorizedError();
  }

  if (!res.ok) {
    throw new GatewayUnavailableError(`Gateway /api/user/me/ returned ${res.status}`);
  }

  const body = (await res.json()) as MeResponse;
  const email = body.user?.email ?? body.email;

  if (email == null || email === "") {
    throw new GatewayUnavailableError("Gateway /api/user/me/ response had no email");
  }

  return { email };
};
