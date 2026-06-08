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

  permissions: ["tabCapture", "offscreen", "storage", "tabs", "activeTab", "cookies"],
  // *.filadd.com covers reading the web-session cookie on filadd.com and the
  // CORS-exempt gateway calls (MV3 host_permissions bypass CORS).
  host_permissions: [
    "http://localhost/*",
    "https://*.amazonaws.com/*",
    "https://*.lambda-url.sa-east-1.on.aws/*",
    "https://*.filadd.com/*",
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

  // _execute_action is Chrome's built-in "open the popup" command — no handler.
  commands: {
    _execute_action: {
      suggested_key: { default: "Ctrl+Shift+S" },
    },
  },
});
