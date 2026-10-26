/** True when the frontend is running inside a Tauri (v2) webview. */
export const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
