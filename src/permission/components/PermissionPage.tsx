import { useState } from "react";

import { t } from "../../shared/i18n";
import { sendMessage } from "../../shared/messages";

type Result = "pending" | "granted" | "denied";

export const PermissionPage = () => {
  const [result, setResult] = useState<Result>("pending");

  // Offscreen documents can't show permission prompts; this visible page obtains
  // the one-time grant for the extension origin, after which the offscreen
  // capture's getUserMedia succeeds silently.
  const handleGrant = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      await sendMessage({ target: "sw", type: "mic-granted" });
      setResult("granted");
    } catch {
      setResult("denied");
    }
  };

  return (
    <main>
      <h1>{t("permission_title")}</h1>
      <p>{t("permission_body")}</p>
      {result !== "granted" ? <button onClick={handleGrant}>{t("permission_grant")}</button> : null}
      {result !== "pending" ? (
        <p>{result === "granted" ? t("permission_granted") : t("permission_denied")}</p>
      ) : null}
    </main>
  );
};
