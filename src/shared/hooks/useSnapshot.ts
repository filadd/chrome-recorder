import { DEFAULT_SNAPSHOT, getSnapshot, type UiSnapshot } from "../storage";
import { useStorageValue } from "./useStorageValue";

export const useSnapshot = (): [UiSnapshot, boolean] =>
  useStorageValue(getSnapshot, "snapshot", "local", DEFAULT_SNAPSHOT);
