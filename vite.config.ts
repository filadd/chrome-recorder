import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";

import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      // Pages not referenced by the manifest (opened via chrome.offscreen / chrome.tabs)
      // must be declared as inputs or CRXJS won't emit them.
      input: {
        offscreen: "src/offscreen/offscreen.html",
        permission: "src/permission/permission.html",
      },
    },
  },
});
