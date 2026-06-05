import { getMicGranted } from "../storage";
import { useStorageValue } from "./useStorageValue";

export const useMicGranted = (): [boolean, boolean] =>
  useStorageValue(getMicGranted, "micGranted", "local", false);
