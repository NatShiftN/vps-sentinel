import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port and never clears the terminal output.
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // Tauri exposes TAURI_* env vars to the frontend at build time.
  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // WebView2 (Windows) / WebKitGTK (Linux) are modern enough for ES2021.
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    // xterm.js is intentionally bundled; the app is shipped locally.
    chunkSizeWarningLimit: 800,
  },
});
