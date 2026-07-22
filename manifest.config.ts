import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extension_name__",
  description: "__MSG_extension_description__",
  version: pkg.version,
  default_locale: "es",

  // Pins the unpacked extension ID to hokpbkbpbggoeibolomknakfccmgoeae so the S3
  // bucket CORS can name an exact origin. Public half of extension-key.pem (the
  // private half is gitignored and must be kept to repackage with this same ID).
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArlUmFTLBBbOJKjAC8tvQY42OXIQkORrfFykFsmd/ZsJrku7x9wdg2KH+xwzSaamwcCLQuUf9mq9UfJ1+mlWTyk2jEkjMb/+umTWsvZTrAi0NvUkr3QasvawAQyZytnKIBtm8WPdw2Qan70TTIgAKssP9VctWrTVOaSF8z96CeK4lriSqx4o6ME+A+TXxOnDF6KSWIQSZF4cK2RbY/jBG2xA3q+YBpKGQ6ut24e+5lKzTFjADoRb3qDmBlTewOqq32XgLkg5KHFR1tNzf9y6JUzlmK408mBBCE38RZymvXpubqjh/f0TRxAEvcVNyrKkdlVFdbcy9beaPyOfL6zpQgwIDAQAB",

  icons: {
    16: "icons/icon16.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },

  // `cookies` + the Filadd frontend origins below let the SW read the
  // `auth._token.local` JWT (see src/shared/auth-token.ts). `*.amazonaws.com` is
  // still needed for the presigned part PUTs that go directly to S3. `localhost`
  // covers the local gateway and a local Filadd frontend (any port).
  permissions: ["tabCapture", "offscreen", "storage", "tabs", "activeTab", "cookies"],
  host_permissions: [
    "http://localhost/*",
    // Local dockerfiles gateway is reached via its `.docker` VIRTUAL_HOST
    // (e.g. http://gateway-service.docker) — needed so the SW's upload fetch isn't blocked.
    "http://*.docker/*",
    // The token cookie is read only from filadd.com (VITE_AUTH_COOKIE_URL);
    // `https://*.filadd.com` also covers the gateway.filadd.com upload fetch, and
    // `http://*.filadd.com` covers a local dev frontend served over http.
    "http://*.filadd.com/*",
    "https://*.filadd.com/*",
    "https://*.amazonaws.com/*",
  ],

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

  // A named command (not the built-in `_execute_action`) so the SW can open the
  // popup explicitly via chrome.action.openPopup(). See the
  // chrome.commands.onCommand handler in the SW.
  commands: {
    "open-popup": {
      suggested_key: { default: "Ctrl+Shift+S" },
      description: "__MSG_command_open_popup__",
    },
  },
});
