import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extension_name__",
  description: "__MSG_extension_description__",
  version: pkg.version,
  default_locale: "es",

  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },

  permissions: ["tabCapture", "offscreen", "storage", "tabs", "activeTab"],
  host_permissions: ["http://localhost/*", "https://*.amazonaws.com/*"],

  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },

  action: {
    default_popup: "src/popup/popup.html",
  },

  content_scripts: [
    {
      matches: ["https://meet.google.com/*"],
      js: ["src/content/content.ts"],
    },
  ],

  // _execute_action is Chrome's built-in "open the popup" command — no handler.
  commands: {
    _execute_action: {
      suggested_key: { default: "Ctrl+Shift+S" },
    },
  },
});
