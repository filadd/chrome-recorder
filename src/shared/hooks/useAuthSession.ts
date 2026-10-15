import { getSession, type StoredSession } from "../auth-session";
import { useStorageValue } from "./useStorageValue";

export const useAuthSession = (): [StoredSession | null, boolean] =>
  useStorageValue(getSession, "authSession", "local", null);
