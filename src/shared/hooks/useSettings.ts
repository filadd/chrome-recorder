import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeSettings,
  setSettings,
  type Settings,
} from "../storage";
import { useStorageValue } from "./useStorageValue";

export interface SettingsHandle {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = (): SettingsHandle => {
  const [settings, loaded] = useStorageValue(getSettings, "settings", "local", DEFAULT_SETTINGS);

  // No optimistic local set — the onChanged listener re-reads after the write,
  // which keeps every open surface (popup, future pages) on the same path.
  const update = (patch: Partial<Settings>): Promise<void> =>
    setSettings(normalizeSettings({ ...settings, ...patch }));

  return { settings, loaded, update };
};
