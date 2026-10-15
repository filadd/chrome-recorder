import { getSession } from "../shared/auth-session";
import { NOT_SIGNED_IN_MESSAGE, START_RESULT_STATUS, type StartResultStatus } from "./start-result";

// A start that fails because the refresh token was rejected has already cleared the
// session (see auth-refresh.ts). Report it as "log in again" rather than surfacing
// the raw 401 from the upload API.
export const resolveStartFailure = async (
  error: unknown,
): Promise<{ status: StartResultStatus; message: string }> =>
  (await getSession()) == null
    ? { status: START_RESULT_STATUS.needsAuth, message: NOT_SIGNED_IN_MESSAGE }
    : { status: START_RESULT_STATUS.error, message: String(error) };
