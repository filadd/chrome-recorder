import { PROFILES } from "../profiles/profiles";
import type { ProfileId } from "../profiles/types";
import { applyI18n, t } from "../shared/i18n";
import { sendMessage } from "../shared/messages";
import {
  getMicGranted,
  getPendingUpload,
  getSettings,
  getSnapshot,
  onSnapshotChange,
  setSettings,
  type Settings,
  type UiSnapshot,
} from "../shared/storage";

applyI18n(document);

const statusEl = document.getElementById("status")!;
const errorDetailEl = document.getElementById("error-detail")!;
const toggleButton = document.getElementById("toggle") as HTMLButtonElement;
const recoveryEl = document.getElementById("recovery")!;
const configEl = document.getElementById("config")!;
const profileSelect = document.getElementById("profile") as HTMLSelectElement;
const profileDesc = document.getElementById("profile-desc")!;
const profileFieldsEl = document.getElementById("profile-fields")!;
const userIdInput = document.getElementById("user-id") as HTMLInputElement;
const micSection = document.getElementById("mic")!;

let settings: Settings;

const renderStatus = (snapshot: UiSnapshot) => {
  statusEl.textContent = t(`popup_status_${snapshot.state}`);
  statusEl.className = `status ${snapshot.state === "recording" ? "recording" : ""} ${snapshot.state === "error" ? "error" : ""}`;

  const showError = snapshot.state === "error" && snapshot.error != null;
  errorDetailEl.classList.toggle("hidden", !showError);
  errorDetailEl.textContent = showError ? snapshot.error : "";

  const stoppable = snapshot.state === "recording" || snapshot.state === "arming";
  const startable = ["idle", "finished", "error"].includes(snapshot.state);

  toggleButton.classList.toggle("hidden", !stoppable && !startable);
  toggleButton.textContent = t(stoppable ? "popup_stop" : "popup_start");

  // While a session is active the popup is a status surface only — profile,
  // metadata, and identity must not change mid-recording.
  const busy = ["arming", "recording", "stopping", "finalizing"].includes(snapshot.state);
  configEl.classList.toggle("hidden", busy);

  if (busy) {
    recoveryEl.classList.add("hidden");
  }
};

const renderProfileFields = () => {
  const profile = PROFILES[settings.profileId];

  profileDesc.textContent = t(profile.descriptionKey);
  profileFieldsEl.replaceChildren();

  for (const field of profile.fields) {
    const wrapper = document.createElement("section");
    wrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = t(field.labelKey) + (field.required ? " *" : "");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t(field.placeholderKey);
    input.value = settings.fields[profile.id]?.[field.key] ?? "";

    input.addEventListener("input", () => {
      settings.fields[profile.id] = {
        ...settings.fields[profile.id],
        [field.key]: input.value,
      };
      setSettings(settings);
    });

    wrapper.append(label, input);
    profileFieldsEl.append(wrapper);
  }
};

const init = async () => {
  settings = await getSettings();

  for (const profile of Object.values(PROFILES)) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = t(profile.labelKey);
    profileSelect.append(option);
  }

  profileSelect.value = settings.profileId;
  userIdInput.value = settings.userId;
  renderProfileFields();

  profileSelect.addEventListener("change", () => {
    settings.profileId = profileSelect.value as ProfileId;
    setSettings(settings);
    renderProfileFields();
  });

  userIdInput.addEventListener("input", () => {
    settings.userId = userIdInput.value;
    setSettings(settings);
  });

  renderStatus(await getSnapshot());
  onSnapshotChange(renderStatus);

  if (!(await getMicGranted())) {
    micSection.classList.remove("hidden");
  }

  document.getElementById("grant-mic")!.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/permission/permission.html") });
  });

  // The popup click is both the activeTab invocation and the user gesture, so a
  // start from here always satisfies tabCapture's requirements.
  toggleButton.addEventListener("click", () => {
    sendMessage({ target: "sw", type: "toggle-recording" });
  });

  const snapshot = await getSnapshot();
  const pending = await getPendingUpload();
  const recordingActive = ["arming", "recording", "stopping", "finalizing"].includes(
    snapshot.state,
  );

  if (pending != null && !recordingActive) {
    recoveryEl.classList.remove("hidden");

    document.getElementById("recover-retry")!.addEventListener("click", async () => {
      await sendMessage({ target: "sw", type: "recover-retry" });
      recoveryEl.classList.add("hidden");
    });

    document.getElementById("recover-abort")!.addEventListener("click", async () => {
      await sendMessage({ target: "sw", type: "recover-abort" });
      recoveryEl.classList.add("hidden");
    });
  }
};

init();
