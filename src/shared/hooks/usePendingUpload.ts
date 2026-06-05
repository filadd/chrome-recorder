import { getPendingUpload, type PendingUpload } from "../storage";
import { useStorageValue } from "./useStorageValue";

export const usePendingUpload = (): [PendingUpload | null, boolean] =>
  useStorageValue(getPendingUpload, "pendingUpload", "local", null);
