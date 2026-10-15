// The outcome of a start/stop attempt, reported back to the popup.
export const START_RESULT_STATUS = {
  started: "started",
  stopped: "stopped",
  needsInvocation: "needs-invocation",
  needsMetadata: "needs-metadata",
  needsPermission: "needs-permission",
  needsAuth: "needs-auth",
  error: "error",
} as const;

export type StartResultStatus = (typeof START_RESULT_STATUS)[keyof typeof START_RESULT_STATUS];

export type StartResult = { status: StartResultStatus };

export const NOT_SIGNED_IN_MESSAGE = "Not signed in — open the extension and log in.";
