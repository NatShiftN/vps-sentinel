export type ModuleSettings = {
  ai: boolean;
  sftp: boolean;
  forward: boolean;
  security: boolean;
};

export type AppSettings = {
  scanlines: boolean;
  reduceMotion: boolean;
  terminalFontSize: number;
  uiScale: number;
  downloadDirectory: string;
  defaultSshPort: number;
  defaultSshUsername: string;
  defaultAutoReconnect: boolean;
  historyEnabled: boolean;
  historyCaptureInput: boolean;
  historyRetentionDays: number;
  modules: ModuleSettings;
};

export const SETTINGS_KEY = "sentinel.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  scanlines: true,
  reduceMotion: false,
  terminalFontSize: 13,
  uiScale: 100,
  downloadDirectory: "",
  defaultSshPort: 22,
  defaultSshUsername: "root",
  defaultAutoReconnect: true,
  historyEnabled: true,
  historyCaptureInput: false,
  historyRetentionDays: 7,
  modules: {
    ai: true,
    sftp: true,
    forward: true,
    security: true,
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const loadSettings = (): AppSettings => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      scanlines:
        typeof parsed.scanlines === "boolean"
          ? parsed.scanlines
          : DEFAULT_SETTINGS.scanlines,
      reduceMotion:
        typeof parsed.reduceMotion === "boolean"
          ? parsed.reduceMotion
          : DEFAULT_SETTINGS.reduceMotion,
      terminalFontSize:
        typeof parsed.terminalFontSize === "number"
          ? clamp(Math.round(parsed.terminalFontSize), 11, 18)
          : DEFAULT_SETTINGS.terminalFontSize,
      uiScale:
        typeof parsed.uiScale === "number"
          ? clamp(Math.round(parsed.uiScale), 85, 125)
          : DEFAULT_SETTINGS.uiScale,
      downloadDirectory:
        typeof parsed.downloadDirectory === "string"
          ? parsed.downloadDirectory
          : DEFAULT_SETTINGS.downloadDirectory,
      defaultSshPort:
        typeof parsed.defaultSshPort === "number" &&
        parsed.defaultSshPort > 0 &&
        parsed.defaultSshPort <= 65535
          ? Math.round(parsed.defaultSshPort)
          : DEFAULT_SETTINGS.defaultSshPort,
      defaultSshUsername:
        typeof parsed.defaultSshUsername === "string" &&
        parsed.defaultSshUsername.trim()
          ? parsed.defaultSshUsername.trim()
          : DEFAULT_SETTINGS.defaultSshUsername,
      defaultAutoReconnect:
        typeof parsed.defaultAutoReconnect === "boolean"
          ? parsed.defaultAutoReconnect
          : DEFAULT_SETTINGS.defaultAutoReconnect,
      historyEnabled:
        typeof parsed.historyEnabled === "boolean"
          ? parsed.historyEnabled
          : DEFAULT_SETTINGS.historyEnabled,
      historyCaptureInput:
        typeof parsed.historyCaptureInput === "boolean"
          ? parsed.historyCaptureInput
          : DEFAULT_SETTINGS.historyCaptureInput,
      historyRetentionDays:
        typeof parsed.historyRetentionDays === "number"
          ? clamp(Math.round(parsed.historyRetentionDays), 1, 365)
          : DEFAULT_SETTINGS.historyRetentionDays,
      modules: {
        ai:
          typeof parsed.modules?.ai === "boolean"
            ? parsed.modules.ai
            : DEFAULT_SETTINGS.modules.ai,
        sftp:
          typeof parsed.modules?.sftp === "boolean"
            ? parsed.modules.sftp
            : DEFAULT_SETTINGS.modules.sftp,
        forward:
          typeof parsed.modules?.forward === "boolean"
            ? parsed.modules.forward
            : DEFAULT_SETTINGS.modules.forward,
        security:
          typeof parsed.modules?.security === "boolean"
            ? parsed.modules.security
            : DEFAULT_SETTINGS.modules.security,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings) => {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are best-effort; the console keeps working without storage.
  }
};
