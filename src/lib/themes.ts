export type ThemeDensity = "compact" | "normal" | "comfortable";

export type ThemeColors = {
  accent: string;
  accentBright: string;
  background: string;
  panel: string;
  text: string;
  textDim: string;
  textFaint: string;
};

export type ThemeLayout = {
  sidebarWidth: number;
  gap: number;
  radius: number;
  density: ThemeDensity;
};

export type ThemePlugin = {
  schema: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  colors: ThemeColors;
  layout: ThemeLayout;
  builtin?: boolean;
};

export type ThemeState = {
  custom: ThemePlugin[];
  activeId: string;
};

export const THEME_STORAGE_KEY = "sentinel.themes.v1";

const CYAN = {
  accent: "#00ffcc",
  accentBright: "#8dfff0",
  background: "#0a0a0a",
  panel: "#08100f",
  text: "#c9fff6",
  textDim: "#a3ebde",
  textFaint: "#8cd7ca",
};

export const BUILTIN_THEMES: ThemePlugin[] = [
  {
    schema: 1,
    id: "sentinel-cyan",
    name: "Sentinel Cyan",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Default phosphor cyan console with the original layout.",
    colors: CYAN,
    layout: { sidebarWidth: 340, gap: 14, radius: 0, density: "normal" },
    builtin: true,
  },
  {
    schema: 1,
    id: "amber-terminal",
    name: "Amber Terminal",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Warm amber phosphor with a compact CRT layout.",
    colors: {
      accent: "#ffb347",
      accentBright: "#ffd9a0",
      background: "#0b0905",
      panel: "#151006",
      text: "#ffe8c7",
      textDim: "#d8b98c",
      textFaint: "#9c815c",
    },
    layout: { sidebarWidth: 320, gap: 12, radius: 0, density: "compact" },
    builtin: true,
  },
  {
    schema: 1,
    id: "magenta-neon",
    name: "Magenta Neon",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "High-contrast magenta on black with a wider terminal.",
    colors: {
      accent: "#ff4fd8",
      accentBright: "#ffb3f0",
      background: "#0a060b",
      panel: "#160a17",
      text: "#ffe0fa",
      textDim: "#d7a6cd",
      textFaint: "#9c6b93",
    },
    layout: { sidebarWidth: 310, gap: 18, radius: 4, density: "comfortable" },
    builtin: true,
  },
  {
    schema: 1,
    id: "matrix-green",
    name: "Matrix Green",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Classic green terminal palette with a narrow sidebar.",
    colors: {
      accent: "#7dff4f",
      accentBright: "#c8ffb0",
      background: "#050a05",
      panel: "#0b140a",
      text: "#d8ffd0",
      textDim: "#9fce94",
      textFaint: "#6f9667",
    },
    layout: { sidebarWidth: 300, gap: 10, radius: 0, density: "compact" },
    builtin: true,
  },
  {
    schema: 1,
    id: "compact-ops",
    name: "Compact Ops",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Cyan theme tuned for small screens and dense telemetry.",
    colors: CYAN,
    layout: { sidebarWidth: 280, gap: 8, radius: 0, density: "compact" },
    builtin: true,
  },
  {
    schema: 1,
    id: "wide-terminal",
    name: "Wide Terminal",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Cyan theme with a wide terminal, larger gaps and soft corners.",
    colors: CYAN,
    layout: {
      sidebarWidth: 380,
      gap: 22,
      radius: 8,
      density: "comfortable",
    },
    builtin: true,
  },
];

export const DEFAULT_THEME = BUILTIN_THEMES[0];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]{2,48}$/;

const isString = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

const isNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isHex = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value);

export const validateTheme = (value: unknown): ThemePlugin => {
  if (!value || typeof value !== "object") {
    throw new Error("Theme manifest must be a JSON object.");
  }
  const raw = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "schema",
    "id",
    "name",
    "version",
    "author",
    "description",
    "colors",
    "layout",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Theme field "${key}" is not allowed.`);
    }
  }
  if (raw.schema !== 1) {
    throw new Error("Theme schema must be 1.");
  }
  if (!isString(raw.id, 48) || !ID.test(raw.id)) {
    throw new Error("Theme id must be a lowercase slug (3-48 chars).");
  }
  if (!isString(raw.name, 80)) throw new Error("Theme name is invalid.");
  if (!isString(raw.version, 32)) throw new Error("Theme version is invalid.");
  if (!isString(raw.author, 80)) throw new Error("Theme author is invalid.");
  if (!isString(raw.description, 300)) {
    throw new Error("Theme description is invalid.");
  }

  if (!raw.colors || typeof raw.colors !== "object") {
    throw new Error("Theme colors are missing.");
  }
  const colors = raw.colors as Record<string, unknown>;
  const allowedColors = new Set([
    "accent",
    "accentBright",
    "background",
    "panel",
    "text",
    "textDim",
    "textFaint",
  ]);
  for (const key of Object.keys(colors)) {
    if (!allowedColors.has(key)) {
      throw new Error(`Theme color "${key}" is not allowed.`);
    }
  }
  for (const key of allowedColors) {
    if (!isHex(colors[key])) {
      throw new Error(`Theme color "${key}" must be #RRGGBB.`);
    }
  }

  if (!raw.layout || typeof raw.layout !== "object") {
    throw new Error("Theme layout is missing.");
  }
  const layout = raw.layout as Record<string, unknown>;
  for (const key of Object.keys(layout)) {
    if (!["sidebarWidth", "gap", "radius", "density"].includes(key)) {
      throw new Error(`Theme layout field "${key}" is not allowed.`);
    }
  }
  if (!isNumber(layout.sidebarWidth, 220, 460)) {
    throw new Error("sidebarWidth must be 220-460.");
  }
  if (!isNumber(layout.gap, 0, 40)) {
    throw new Error("gap must be 0-40.");
  }
  if (!isNumber(layout.radius, 0, 18)) {
    throw new Error("radius must be 0-18.");
  }
  if (
    layout.density !== "compact" &&
    layout.density !== "normal" &&
    layout.density !== "comfortable"
  ) {
    throw new Error("density must be compact, normal or comfortable.");
  }

  return {
    schema: 1,
    id: raw.id,
    name: raw.name,
    version: raw.version,
    author: raw.author,
    description: raw.description,
    colors: colors as ThemeColors,
    layout: {
      sidebarWidth: Math.round(layout.sidebarWidth),
      gap: Math.round(layout.gap),
      radius: Math.round(layout.radius),
      density: layout.density,
    },
  };
};

export const allThemes = (custom: ThemePlugin[]) => [
  ...BUILTIN_THEMES,
  ...custom,
];

export const loadThemeState = (): ThemeState => {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return { custom: [], activeId: DEFAULT_THEME.id };
    const parsed = JSON.parse(raw) as {
      custom?: unknown;
      activeId?: unknown;
    };
    const custom: ThemePlugin[] = [];
    if (Array.isArray(parsed.custom)) {
      for (const entry of parsed.custom.slice(0, 24)) {
        try {
          const theme = validateTheme(entry);
          if (!BUILTIN_THEMES.some((builtin) => builtin.id === theme.id)) {
            custom.push(theme);
          }
        } catch {
          // Drop malformed imported themes.
        }
      }
    }
    const available = allThemes(custom);
    const activeId =
      typeof parsed.activeId === "string" &&
      available.some((theme) => theme.id === parsed.activeId)
        ? parsed.activeId
        : DEFAULT_THEME.id;
    return { custom, activeId };
  } catch {
    return { custom: [], activeId: DEFAULT_THEME.id };
  }
};

export const saveThemeState = (state: ThemeState) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Theme persistence is best-effort.
  }
};

export const hexToRgb = (hex: string) => {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
};

export const applyTheme = (theme: ThemePlugin) => {
  const root = document.documentElement;
  const accent = hexToRgb(theme.colors.accent);
  const rgb = `${accent.r}, ${accent.g}, ${accent.b}`;
  const rgba = (alpha: number) =>
    `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${alpha})`;

  root.style.setProperty("--accent", theme.colors.accent);
  root.style.setProperty("--accent-rgb", rgb);
  root.style.setProperty("--accent-bright", theme.colors.accentBright);
  root.style.setProperty("--accent-soft", rgba(0.55));
  root.style.setProperty("--accent-dim", rgba(0.28));
  root.style.setProperty("--accent-faint", rgba(0.1));
  root.style.setProperty("--line", rgba(0.16));
  root.style.setProperty("--line-strong", rgba(0.34));
  root.style.setProperty("--text", theme.colors.text);
  root.style.setProperty("--text-dim", theme.colors.textDim);
  root.style.setProperty("--text-faint", theme.colors.textFaint);
  root.style.setProperty("--bg", theme.colors.background);
  root.style.setProperty("--bg-panel", theme.colors.panel);
  root.style.setProperty(
    "--glow-sm",
    `0 0 6px ${rgba(0.45)}`
  );
  root.style.setProperty(
    "--glow-md",
    `0 0 14px ${rgba(0.35)}`
  );
  root.style.setProperty(
    "--glow-lg",
    `0 0 32px ${rgba(0.22)}`
  );
  root.style.setProperty("--sidebar-width", `${theme.layout.sidebarWidth}px`);
  root.style.setProperty("--layout-gap", `${theme.layout.gap}px`);
  root.style.setProperty("--panel-radius", `${theme.layout.radius}px`);
  root.dataset.density = theme.layout.density;
  root.dataset.theme = theme.id;
};
