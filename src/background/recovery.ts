import { getAuthToken } from "../shared/auth-token";
import { clearPendingUpload, getPendingUpload } from "../shared/storage";
import { abortUpload, getUploadStatus, recordPart } from "../upload/api-client";

// Recovery finalizes what was already uploaded — capture itself cannot resume after
// a crash. The server owns the parts ledger now, so recovery just reconciles the
// session by its key: complete a still-PENDING prefix, or clear an already-finished
// or vanished session.
export const retryPendingUpload = async (): Promise<boolean> => {
  const pending = await getPendingUpload();

  if (pending == null) {
    return false;
  }

  const token = await getAuthToken();

  if (token == null) {
    // No Filadd session to authenticate with — leave the pending upload for a
    // later retry rather than dropping it.
    return false;
  }

  let status: string;

  try {
    status = (await getUploadStatus(pending.session.key, token)).status;
  } catch {
    // The session is gone (404) or unreachable — nothing to finalize.
    await clearPendingUpload();
    return false;
  }

  // Already assembled (or assembling) server-side — done from the client's side.
  if (status === "COMPLETED" || status === "ASSEMBLING") {
    await clearPendingUpload();
    return true;
  }

  // Finalize the uploaded prefix: re-send the last recorded part with complete:true
  // (idempotent on a matching ETag).
  if (status === "PENDING" && pending.lastPart != null) {
    await recordPart({ key: pending.session.key, ...pending.lastPart, complete: true }, token);
    await clearPendingUpload();
    return true;
  }

  // PENDING with nothing recorded, or a terminal error — nothing useful to finalize.
  await clearPendingUpload();
  return false;
};

export const abortPendingUpload = async (): Promise<void> => {
  const pending = await getPendingUpload();

  if (pending == null) {
    return;
  }

  const token = await getAuthToken();

  if (token != null) {
    await abortUpload(pending.session.key, token).catch(() => undefined);
  }

  await clearPendingUpload();
};
