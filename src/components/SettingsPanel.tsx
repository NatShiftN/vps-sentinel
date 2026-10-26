import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../lib/tauri";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ModuleSettings,
} from "../lib/settings";
import { validateTheme, type ThemePlugin } from "../lib/themes";
import type { HistoryStats } from "../lib/history";
import { KeyManager } from "./KeyManager";
import { useI18n } from "../lib/i18n";

type KnownHost = {
  host: string;
  fingerprint: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onOpenAi: () => void;
  themes: ThemePlugin[];
  activeThemeId: string;
  onApplyTheme: (id: string) => void;
  onInstallTheme: (theme: ThemePlugin) => void;
  onRemoveTheme: (id: string) => void;
};

const MODULES: Array<{
  key: keyof ModuleSettings;
  name: string;
  detail: string;
}> = [
  {
    key: "ai",
    name: "AI copilot",
    detail: "OpenAI-compatible chat, context injection and terminal insert",
  },
  {
    key: "sftp",
    name: "SFTP browser",
    detail: "Browse, download, upload, rename, mkdir and delete",
  },
  {
    key: "forward",
    name: "Local port forward",
    detail: "127.0.0.1 listener → remote TCP destination",
  },
  {
    key: "security",
    name: "Security audit",
    detail: "Read-only remote checks and findings",
  },
];

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  onOpenAi,
  themes,
  activeThemeId,
  onApplyTheme,
  onInstallTheme,
  onRemoveTheme,
}: Props) {
  const { language, setLanguage, t } = useI18n();
  const [knownHosts, setKnownHosts] = useState<KnownHost[]>([]);
  const [configPath, setConfigPath] = useState("");
  const [historyStats, setHistoryStats] = useState<HistoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<AppSettings>) =>
    onChange({ ...settings, ...patch });

  const updateModule = (key: keyof ModuleSettings, value: boolean) =>
    onChange({
      ...settings,
      modules: { ...settings.modules, [key]: value },
    });

  const loadHosts = useCallback(async () => {
    if (!isTauriRuntime()) {
      setConfigPath("browser preview");
      return;
    }
    try {
      const [hosts, path, stats] = await Promise.all([
        invoke<KnownHost[]>("list_known_hosts"),
        invoke<string>("app_config_path"),
        invoke<HistoryStats>("history_stats"),
      ]);
      setKnownHosts(hosts);
      setConfigPath(path);
      setHistoryStats(stats);
    } catch (caught) {
      setError(String(caught));
    }
  }, []);

  useEffect(() => {
    if (open) void loadHosts();
  }, [open, loadHosts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const removeHost = async (host: string) => {
    if (!window.confirm(t("Forget host key for {host}?", { host }))) return;
    try {
      await invoke("remove_known_host", { host });
      setStatus(t("removed {name}", { name: host }));
      await loadHosts();
    } catch (caught) {
      setError(String(caught));
    }
  };

  const clearAi = () => {
    if (!window.confirm(t("Clear the saved AI conversation for this window?"))) {
      return;
    }
    try {
      window.localStorage.removeItem("sentinel.ai.conversation.v1");
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("sentinel.ai.conversation.v1::"))
        .forEach((key) => window.localStorage.removeItem(key));
      setStatus(t("AI conversation cleared"));
    } catch {
      setError(t("Could not clear stored AI conversation."));
    }
  };

  const resetSettings = () => {
    if (!window.confirm(t("Reset all app settings to defaults?"))) return;
    onChange({ ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules } });
    setStatus(t("settings reset"));
  };

  const importTheme = async (file: File) => {
    setError(null);
    setStatus(null);
    if (file.size > 16 * 1024) {
      setError(t("Theme manifest must be smaller than 16 KB."));
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const theme = validateTheme(raw);
      if (themes.some((item) => item.id === theme.id)) {
        setError(t("A theme with id \"{id}\" already exists.", { id: theme.id }));
        return;
      }
      onInstallTheme(theme);
      setStatus(t("installed {name}", { name: theme.name }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <aside className="ai-drawer settings-drawer" aria-label={t("Application settings")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ⚙
          </span>
          <div>
            <h2>{t("SETTINGS")}</h2>
            <p>{t("appearance · connection · modules · data")}</p>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className="ai-iconbtn ai-iconbtn--close"
            type="button"
            onClick={onClose}
            title={t("close")}
            aria-label={t("close")}
          >
            ×
          </button>
        </div>
      </header>

      <div className="ai-drawer__body settings-body">
        <section className="settings-section">
          <h3>{t("language")}</h3>
          <label className="settings-row">
            <span>
              <b>{t("Interface language")}</b>
              <small>
                {t("English / 简体中文 · saved per profile")}
              </small>
            </span>
            <select
              className="settings-select"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value === "zh-CN" ? "zh-CN" : "en")
              }
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>{t("theme market · local")}</h3>
          <p className="settings-note">
            {t("Declarative themes only: colours and layout values, no JavaScript, HTML or raw CSS. Import is validated and capped at 16 KB.")}
          </p>
          <div className="theme-grid">
            {themes.map((theme) => (
              <article
                className={`theme-card ${
                  theme.id === activeThemeId ? "is-active" : ""
                }`}
                key={theme.id}
              >
                <div className="theme-swatch" aria-hidden>
                  <span style={{ background: theme.colors.background }} />
                  <span style={{ background: theme.colors.panel }} />
                  <span style={{ background: theme.colors.accent }} />
                  <span style={{ background: theme.colors.text }} />
                </div>
                <header>
                  <b>{theme.name}</b>
                  <span>{theme.builtin ? t("built-in") : theme.version}</span>
                </header>
                <p>{theme.description}</p>
                <small>
                  {theme.layout.sidebarWidth}px sidebar · {theme.layout.gap}px
                  gap · {theme.layout.density}
                </small>
                <div className="theme-actions">
                  <button
                    type="button"
                    onClick={() => {
                      onApplyTheme(theme.id);
                      setStatus(t("theme applied") + `: ${theme.name}`);
                    }}
                    disabled={theme.id === activeThemeId}
                  >
                    {theme.id === activeThemeId ? t("active") : t("apply")}
                  </button>
                  {!theme.builtin ? (
                    <button
                      type="button"
                      className="settings-danger"
                      onClick={() => {
                        if (!window.confirm(t("Remove theme {name}?", { name: theme.name }))) {
                          return;
                        }
                        onRemoveTheme(theme.id);
                        setStatus(t("theme removed") + `: ${theme.name}`);
                      }}
                    >
                      {t("remove")}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <div className="settings-actions">
            <button
              className="settings-action"
              type="button"
              onClick={() => importRef.current?.click()}
            >
              {t("import theme .json")}
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="theme-import-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importTheme(file);
              }}
            />
          </div>
        </section>

        <section className="settings-section">
          <h3>{t("appearance")}</h3>
          <label className="settings-row">
            <span>
              <b>{t("CRT scanlines")}</b>
              <small>{t("subtle scanline + vignette overlay")}</small>
            </span>
            <input
              type="checkbox"
              checked={settings.scanlines}
              onChange={(event) => update({ scanlines: event.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>
              <b>{t("Reduce motion")}</b>
              <small>{t("disable animations and transitions")}</small>
            </span>
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(event) =>
                update({ reduceMotion: event.target.checked })
              }
            />
          </label>
          <label className="settings-row">
            <span>
              <b>{t("Terminal font size")}</b>
              <small>{settings.terminalFontSize}px</small>
            </span>
            <input
              className="settings-range"
              type="range"
              min={11}
              max={18}
              step={1}
              value={settings.terminalFontSize}
              onChange={(event) =>
                update({ terminalFontSize: Number(event.target.value) })
              }
            />
          </label>
          <label className="settings-row">
            <span>
              <b>{t("Interface scale")}</b>
              <small>{t("Scale the whole UI; terminal font size is separate")}</small>
            </span>
            <select
              className="settings-select"
              value={settings.uiScale}
              onChange={(event) =>
                update({ uiScale: Number(event.target.value) })
              }
            >
              {[85, 100, 115, 125].map((scale) => (
                <option key={scale} value={scale}>
                  {scale}%
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>{t("connection defaults")}</h3>
          <div className="settings-grid">
            <label className="settings-field">
              <span>{t("default username")}</span>
              <input
                value={settings.defaultSshUsername}
                onChange={(event) =>
                  update({ defaultSshUsername: event.target.value })
                }
                spellCheck={false}
              />
            </label>
            <label className="settings-field">
              <span>{t("default port")}</span>
              <input
                value={settings.defaultSshPort}
                inputMode="numeric"
                onChange={(event) => {
                  const port = Number(event.target.value);
                  if (Number.isInteger(port) && port > 0 && port <= 65535) {
                    update({ defaultSshPort: port });
                  }
                }}
              />
            </label>
          </div>
          <label className="settings-row">
            <span>
              <b>{t("Auto-reconnect by default")}</b>
              <small>{t("new connection dialogs start with this checked")}</small>
            </span>
            <input
              type="checkbox"
              checked={settings.defaultAutoReconnect}
              onChange={(event) =>
                update({ defaultAutoReconnect: event.target.checked })
              }
            />
          </label>
        </section>

        <section className="settings-section">
          <h3>{t("module market · built-in")}</h3>
          <p className="settings-note">
            {t("These modules are compiled into the app and can be enabled or disabled here. External plugin downloads are not connected yet: a real marketplace needs a plugin API, sandbox, signatures and an update channel.")}
          </p>
          <div className="settings-market">
            {MODULES.map((module) => (
              <article className="market-card" key={module.key}>
                <header>
                  <b>{t(module.name)}</b>
                  <span>{t("built-in")}</span>
                </header>
                <p>{t(module.detail)}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.modules[module.key]}
                    onChange={(event) =>
                      updateModule(module.key, event.target.checked)
                    }
                  />
                  <span>
                    {settings.modules[module.key] ? t("enabled") : t("disabled")}
                  </span>
                </label>
              </article>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>{t("ai provider")}</h3>
          <p className="settings-note">
            {t("Base URL, model and key live in the AI drawer settings (keychain / config fallback).")}
          </p>
          <button className="settings-action" type="button" onClick={onOpenAi}>
            {t("open AI settings")}
          </button>
        </section>

        <section className="settings-section">
          <h3>{t("session history")}</h3>
          <label className="settings-row">
            <span>
              <b>{t("Record terminal output")}</b>
              <small>
                {t("SQLite history; up to 8 MB per session. Output may contain secrets or sensitive logs.")}
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.historyEnabled}
              onChange={(event) =>
                update({ historyEnabled: event.target.checked })
              }
            />
          </label>
          <label className="settings-row">
            <span>
              <b>{t("Capture typed commands")}</b>
              <small>
                {t("Off by default. May capture passwords typed at sudo/password prompts. Only enable on trusted hosts.")}
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.historyCaptureInput}
              onChange={(event) =>
                update({ historyCaptureInput: event.target.checked })
              }
            />
          </label>
          <label className="settings-row">
            <span>
              <b>{t("Retention")}</b>
              <small>{t("Older sessions are pruned on startup/config change.")}</small>
            </span>
            <select
              className="settings-select"
              value={settings.historyRetentionDays}
              onChange={(event) =>
                update({ historyRetentionDays: Number(event.target.value) })
              }
            >
              {[1, 3, 7, 14, 30, 90].map((days) => (
                <option key={days} value={days}>
                  {days} {t("days")}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-note">
            {historyStats
              ? `${t("SQLite · {count} sessions · {size}", { count: historyStats.sessions, size: `${(historyStats.outputBytes / (1024 * 1024)).toFixed(1)} MB` })} · ${historyStats.path}`
              : t("history stats unavailable")}
          </p>
          <div className="settings-actions">
            <button
              className="settings-action"
              type="button"
              onClick={() => void loadHosts()}
            >
              {t("refresh stats")}
            </button>
            <button
              className="settings-danger"
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    t("Delete all stored session history? This cannot be undone.")
                  )
                ) {
                  return;
                }
                if (!isTauriRuntime()) return;
                void invoke("clear_history")
                  .then(() => {
                    setStatus(t("history cleared"));
                    return loadHosts();
                  })
                  .catch((caught) => setError(String(caught)));
              }}
            >
              {t("clear history")}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>{t("downloads")}</h3>
          <label className="settings-row">
            <span>
              <b>{t("Default download directory")}</b>
              <small>{t("Leave blank to ask for a location on every download")}</small>
            </span>
            <div className="settings-path">
              <input
                value={settings.downloadDirectory}
                onChange={(event) =>
                  update({ downloadDirectory: event.target.value })
                }
                placeholder={t("Ask every time")}
                spellCheck={false}
              />
              <button
                className="settings-action"
                type="button"
                onClick={() => {
                  if (!isTauriRuntime()) return;
                  void invoke<string | null>("pick_download_directory", {
                    startDir: settings.downloadDirectory || null,
                  })
                    .then((path) => {
                      if (path) update({ downloadDirectory: path });
                    })
                    .catch((caught) => setError(String(caught)));
                }}
              >
                {t("browse")}
              </button>
            </div>
          </label>
          <p className="settings-note">
            {settings.downloadDirectory || t("Ask every time")}
          </p>
        </section>

        <section className="settings-section">
          <h3>{t("known hosts")}</h3>
          <p className="settings-note">
            {configPath || t("resolving app config directory…")}
          </p>
          <div className="settings-hosts">
            {knownHosts.length === 0 ? (
              <p className="settings-note">{t("no trusted host keys")}</p>
            ) : (
              knownHosts.map((host) => (
                <div className="settings-host" key={host.host}>
                  <div>
                    <b>{host.host}</b>
                    <small>{host.fingerprint}</small>
                  </div>
                  <button
                    className="settings-danger"
                    type="button"
                    onClick={() => void removeHost(host.host)}
                  >
                    {t("forget")}
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="settings-actions">
            <button
              className="settings-action"
              type="button"
              onClick={() => void loadHosts()}
            >
              {t("refresh")}
            </button>
            <button
              className="settings-action"
              type="button"
              onClick={() => {
                if (!isTauriRuntime()) return;
                void invoke("open_app_config_folder").catch((caught) =>
                  setError(String(caught))
                );
              }}
            >
              {t("open config folder")}
            </button>
          </div>
        </section>

        <KeyManager />

        <section className="settings-section">
          <h3>{t("data")}</h3>
          <div className="settings-actions">
            <button className="settings-action" type="button" onClick={clearAi}>
              {t("Clear AI conversation")}
            </button>
            <button
              className="settings-danger"
              type="button"
              onClick={resetSettings}
            >
              {t("Reset settings")}
            </button>
          </div>
        </section>

        {error ? <p className="sec-error">{error}</p> : null}
        {status ? <p className="sftp-status">{status}</p> : null}

        <section className="settings-section settings-about">
          <h3>{t("about")}</h3>
          <p>{t("VPS//SENTINEL 0.1.0 · Tauri 2 · React 18")}</p>
          <p>{t("Windows portable build · no installer")}</p>
          <p>{t("Created by Mr.N")}</p>
        </section>
      </div>
    </aside>
  );
}
