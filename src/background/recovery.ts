import { abortUpload, completeUpload, listParts } from "../upload/api-client";
import { clearPendingUpload, getPendingUpload } from "../shared/storage";

// Recovery finalizes what was already uploaded — capture itself cannot resume after
// a crash. Our own ETag ledger is authoritative (per AWS guidance); ListParts only
// confirms the upload still exists server-side.
export const retryPendingUpload = async (): Promise<boolean> => {
  const pending = await getPendingUpload();

  if (pending == null) {
    return false;
  }

  const ledger = Object.entries(pending.parts)
    .map(([partNumber, etag]) => ({ PartNumber: Number(partNumber), ETag: etag }))
    .sort((a, b) => a.PartNumber - b.PartNumber);

  if (ledger.length === 0) {
    await abortUpload(pending.session).catch(() => undefined);
    await clearPendingUpload();
    return false;
  }

  await listParts(pending.session);
  await completeUpload(pending.session, ledger);
  await clearPendingUpload();

  return true;
};

export const abortPendingUpload = async (): Promise<void> => {
  const pending = await getPendingUpload();

  if (pending != null) {
    await abortUpload(pending.session).catch(() => undefined);
    await clearPendingUpload();
  }
};
