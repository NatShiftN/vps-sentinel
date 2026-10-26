import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./App.css";
import {
  useSystemStatsPolling,
  type DiskStat,
  type SysStats,
} from "./hooks/useSystemStatsPolling";
import {
  AiAssistant,
  type AiInsertResult,
  type AiSeed,
} from "./components/AiAssistant";
import { SecurityPanel } from "./components/SecurityPanel";
import { SftpPanel } from "./components/SftpPanel";
import { ForwardPanel } from "./components/ForwardPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { PluginsPanel } from "./components/PluginsPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ScreenSaver } from "./components/ScreenSaver";
import { OpenSshPane } from "./components/OpenSshPane";
import { HostsPanel } from "./components/HostsPanel";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "./lib/tauri";
import { useI18n } from "./lib/i18n";
import type { RemoteForward } from "./lib/forward";
import type { OpenSshConfig } from "./lib/openssh";
import {
  hostToTarget,
  loadHosts,
  saveHosts,
  type HostProfile,
} from "./lib/hosts";
import {
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./lib/settings";
import {
  DEFAULT_THEME,
  allThemes,
  applyTheme,
  hexToRgb,
  loadThemeState,
  saveThemeState,
  type ThemePlugin,
  type ThemeState,
} from "./lib/themes";
import {
  allPlugins,
  loadPluginState,
  savePluginState,
  type Plugin,
  type PluginState,
} from "./lib/plugins";
import {
  TerminalPane,
  type SessionSnapshot,
  type TerminalPaneHandle,
} from "./components/TerminalPane";
import type { SshTarget } from "./hooks/useSshSession";
import { sanitizeShellCommand } from "./lib/ai";
import { formatGb, formatUptime } from "./lib/format";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const HISTORY_LEN = 40;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const pad2 = (n: number) => String(n).padStart(2, "0");

const clockOf = (d: Date) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

const dateOf = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const emptySeries = () => Array.from({ length: HISTORY_LEN }, () => 0);

type AppTab = {
  id: string;
  autoConnect: boolean;
  initialTarget: SshTarget | null;
  external?: OpenSshConfig;
};

const TAB_STORAGE_KEY = "sentinel.tabs.v1";

const isSshTarget = (value: unknown): value is SshTarget => {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<SshTarget>;
  return (
    typeof target.host === "string" &&
    target.host.length > 0 &&
    typeof target.port === "number" &&
    target.port > 0 &&
    target.port <= 65535 &&
    typeof target.username === "string" &&
    target.username.length > 0 &&
    (target.authMethod === "password" ||
      target.authMethod === "key" ||
      target.authMethod === "agent") &&
    typeof target.privateKeyPath === "string" &&
    typeof target.autoReconnect === "boolean"
  );
};

const loadPersistedTabs = (): AppTab[] => {
  try {
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (!raw) return [{ id: "tab-1", autoConnect: false, initialTarget: null }];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [{ id: "tab-1", autoConnect: false, initialTarget: null }];
    }
    const tabs = parsed
      .slice(0, 8)
      .map((entry, index) => {
        const target =
          entry &&
          typeof entry === "object" &&
          isSshTarget((entry as { target?: unknown }).target)
            ? (entry as { target: SshTarget }).target
            : null;
        return {
          id: `tab-${index + 1}`,
          autoConnect: false,
          initialTarget: target,
        };
      })
      .filter((tab) => tab.initialTarget !== null);
    return tabs.length > 0
      ? tabs
      : [{ id: "tab-1", autoConnect: false, initialTarget: null }];
  } catch {
    return [{ id: "tab-1", autoConnect: false, initialTarget: null }];
  }
};

const EMPTY_SNAPSHOT: SessionSnapshot = {
  status: "idle",
  target: null,
  hostKey: null,
  remoteStats: null,
  remoteError: null,
  error: null,
  reconnectAttempt: 0,
  termSize: { cols: 0, rows: 0 },
  hasSession: false,
  linkUp: false,
  bytesIn: 0,
  bytesOut: 0,
  lastActivityAt: null,
  connectedAt: null,
};

/* ============================================================================
 * SMALL PRESENTATIONAL PIECES
 * ==========================================================================*/

function Corners({ large = false }: { large?: boolean }) {
  const cls = large ? "corner corner--lg" : "corner";
  return (
    <>
      <i className={`${cls} corner--tl`} aria-hidden />
      <i className={`${cls} corner--tr`} aria-hidden />
      <i className={`${cls} corner--bl`} aria-hidden />
      <i className={`${cls} corner--br`} aria-hidden />
    </>
  );
}

function Panel({
  label,
  code,
  meta,
  className = "",
  children,
}: {
  label: string;
  code: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <Corners />
      <header className="panel__head">
        <span className="panel__label">{label}</span>
        <span className="panel__rule" aria-hidden />
        {meta ? <span className="panel__meta">{meta}</span> : null}
        <span className="panel__code">{code}</span>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

function Gauge({
  label,
  value,
  meta,
}: {
  label: string;
  value: number;
  meta: string;
}) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const pct = clamp(value, 0, 100);

  return (
    <div className="gauge">
      <div className="gauge__ring">
        <svg
          className="gauge__svg"
          viewBox="0 0 120 120"
          role="img"
          aria-label={`${label} utilisation ${Math.round(pct)} percent`}
        >
          <circle className="gauge__orbit" cx="60" cy="60" r="56" />
          <circle className="gauge__track" cx="60" cy="60" r="44" />
          <circle
            className="gauge__fill"
            cx="60"
            cy="60"
            r="44"
            transform="rotate(-90 60 60)"
            strokeDasharray={C}
            strokeDashoffset={C - (pct / 100) * C}
          />
          {Array.from({ length: 48 }, (_, i) => {
            const angle = (i / 48) * Math.PI * 2 - Math.PI / 2;
            const outer = 55;
            const inner = i % 4 === 0 ? 49 : 52;
            return (
              <line
                key={i}
                className={`gauge__tick ${i / 48 <= pct / 100 ? "is-on" : ""}`}
                x1={60 + Math.cos(angle) * outer}
                y1={60 + Math.sin(angle) * outer}
                x2={60 + Math.cos(angle) * inner}
                y2={60 + Math.sin(angle) * inner}
              />
            );
          })}
        </svg>
        <div className="gauge__readout">
          <span className="gauge__num">
            {String(Math.round(pct)).padStart(2, "0")}
          </span>
          <span className="gauge__unit">%</span>
        </div>
      </div>
      <span className="gauge__label">{label}</span>
      <span className="gauge__meta">{meta}</span>
    </div>
  );
}

function NetworkChart({ down, up }: { down: number[]; up: number[] }) {
  const W = 100;
  const H = 40;
  const max = Math.max(16, ...down, ...up) * 1.12;

  const build = (series: number[]) => {
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - (v / max) * (H - 3) - 1.5;
      return [x, y] as const;
    });
    const line = pts
      .map(
        ([x, y], i) =>
          `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
      )
      .join(" ");
    return {
      line,
      area: `${line} L${W} ${H} L0 ${H} Z`,
      last: pts[pts.length - 1],
    };
  };

  const dl = build(down);
  const ul = build(up);
  const dotLeft = `${(dl.last[0] / W) * 100}%`;
  const dotTop = `${(dl.last[1] / H) * 100}%`;

  return (
    <div className="chart">
      <div className="chart__grid" aria-hidden />
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="netArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="70%" stopColor="var(--accent)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="chart__area" d={dl.area} />
        <path
          className="chart__line"
          d={dl.line}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="chart__line chart__line--up"
          d={ul.line}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="chart__dot"
        style={{ left: dotLeft, top: dotTop }}
        aria-hidden
      />
      <div className="chart__axis" aria-hidden>
        <span>{Math.round(max)}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
    </div>
  );
}

/* ============================================================================
 * APP
 * ==========================================================================*/

const formatBytesShort = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export default function App() {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [cpu, setCpu] = useState(0);
  const [cpuCores, setCpuCores] = useState(0);
  const [cpuBrand, setCpuBrand] = useState("");
  const [mem, setMem] = useState(0);
  const [memUsedBytes, setMemUsedBytes] = useState(0);
  const [memTotalBytes, setMemTotalBytes] = useState(0);
  const [down, setDown] = useState(0);
  const [up, setUp] = useState(0);
  const [downHistory, setDownHistory] = useState<number[]>(emptySeries);
  const [upHistory, setUpHistory] = useState<number[]>(emptySeries);
  const [disks, setDisks] = useState<DiskStat[]>([]);
  const [hostname, setHostname] = useState("");
  const [uptime, setUptime] = useState(0);

  const initialTabs = useMemo(loadPersistedTabs, []);
  const [tabs, setTabs] = useState<AppTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState(
    initialTabs[0]?.id ?? "tab-1"
  );
  const [snapshots, setSnapshots] = useState<
    Record<string, SessionSnapshot>
  >({});
  const [aiOpen, setAiOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [sftpOpen, setSftpOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [screenSaverOpen, setScreenSaverOpen] = useState(false);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [hostsOpen, setHostsOpen] = useState(false);
  const [hosts, setHosts] = useState<HostProfile[]>(loadHosts);
  const [broadcastInput, setBroadcastInput] = useState(false);
  const broadcastRef = useRef(false);
  const [latency, setLatency] = useState<{
    ms: number | null;
    error: string | null;
    at: number | null;
  }>({ ms: null, error: null, at: null });
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [themeState, setThemeState] = useState<ThemeState>(loadThemeState);
  const [pluginState, setPluginState] = useState<PluginState>(loadPluginState);
  const [aiSeed, setAiSeed] = useState<AiSeed | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);

  const tabSeq = useRef(initialTabs.length);
  const paneRefs = useRef<Record<string, TerminalPaneHandle | null>>({});
  const activePaneRef = useRef<TerminalPaneHandle | null>(null);
  const linkUpRef = useRef(false);
  const aiContextRef = useRef("");
  const aiSeedId = useRef(0);

  const applySysStats = useCallback((stats: SysStats) => {
    setCpu(clamp(stats.cpuUsage, 0, 100));
    setCpuCores(stats.cpuCores);
    setCpuBrand(stats.cpuBrand);
    setMemUsedBytes(stats.memoryUsed);
    setMemTotalBytes(stats.memoryTotal);
    setMem(
      stats.memoryTotal > 0
        ? clamp((stats.memoryUsed / stats.memoryTotal) * 100, 0, 100)
        : 0
    );

    const rx = stats.netRxRate / (1024 * 1024);
    const tx = stats.netTxRate / (1024 * 1024);
    setDown(rx);
    setUp(tx);
    setDownHistory((previous) => [...previous.slice(1), rx]);
    setUpHistory((previous) => [...previous.slice(1), tx]);
    setDisks(stats.disks.slice(0, 4));
    setHostname(stats.hostname);
    setUptime(stats.uptime);
  }, []);

  useSystemStatsPolling(1000, applySysStats);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const themes = useMemo(() => allThemes(themeState.custom), [themeState.custom]);
  const activeTheme =
    themes.find((theme) => theme.id === themeState.activeId) ?? DEFAULT_THEME;

  const terminalTheme = useMemo(() => {
    const accent = hexToRgb(activeTheme.colors.accent);
    return {
      background: activeTheme.colors.panel,
      foreground: activeTheme.colors.text,
      cursor: activeTheme.colors.accent,
      selectionBackground: `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.24)`,
      accent: activeTheme.colors.accent,
    };
  }, [activeTheme]);

  useEffect(() => {
    applyTheme(activeTheme);
    saveThemeState(themeState);
  }, [activeTheme, themeState]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow.isMaximized().then(setIsMaximized).catch(() => undefined);
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then(setIsMaximized).catch(() => undefined);
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    document.documentElement.style.zoom = `${settings.uiScale}%`;
  }, [settings.uiScale]);

  useEffect(() => {
    savePluginState(pluginState);
  }, [pluginState]);

  useEffect(() => {
    saveHosts(hosts);
  }, [hosts]);

  useEffect(() => {
    broadcastRef.current = broadcastInput;
  }, [broadcastInput]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void invoke("set_history_config", {
      enabled: settings.historyEnabled,
      captureInput: settings.historyCaptureInput,
      retentionDays: settings.historyRetentionDays,
    }).catch((caught) => {
      console.warn("[history] config sync failed:", caught);
    });
  }, [
    settings.historyEnabled,
    settings.historyCaptureInput,
    settings.historyRetentionDays,
  ]);

  const plugins = useMemo(
    () => allPlugins(pluginState.custom),
    [pluginState.custom]
  );

  const applyThemeById = useCallback((id: string) => {
    setThemeState((previous) => ({ ...previous, activeId: id }));
  }, []);

  const installTheme = useCallback((theme: ThemePlugin) => {
    setThemeState((previous) => ({
      custom: [...previous.custom.filter((item) => item.id !== theme.id), theme],
      activeId: theme.id,
    }));
  }, []);

  const removeTheme = useCallback((id: string) => {
    setThemeState((previous) => {
      const custom = previous.custom.filter((theme) => theme.id !== id);
      const stillAvailable = allThemes(custom).some(
        (theme) => theme.id === previous.activeId
      );
      return {
        custom,
        activeId: stillAvailable ? previous.activeId : DEFAULT_THEME.id,
      };
    });
  }, []);

  const togglePlugin = useCallback((id: string, enabled: boolean) => {
    setPluginState((previous) => ({
      ...previous,
      disabled: enabled
        ? previous.disabled.filter((item) => item !== id)
        : Array.from(new Set([...previous.disabled, id])),
    }));
  }, []);

  const installPlugin = useCallback((plugin: Plugin) => {
    setPluginState((previous) => ({
      custom: [...previous.custom.filter((item) => item.id !== plugin.id), plugin],
      disabled: previous.disabled.filter((id) => id !== plugin.id),
    }));
  }, []);

  const removePlugin = useCallback((id: string) => {
    setPluginState((previous) => ({
      custom: previous.custom.filter((plugin) => plugin.id !== id),
      disabled: previous.disabled.filter((item) => item !== id),
    }));
  }, []);

  const saveHost = useCallback((host: HostProfile) => {
    setHosts((previous) => [
      ...previous.filter((item) => item.id !== host.id),
      host,
    ]);
  }, []);

  const removeHost = useCallback((id: string) => {
    setHosts((previous) => previous.filter((host) => host.id !== id));
  }, []);

  const importHosts = useCallback((incoming: HostProfile[]) => {
    setHosts((previous) => {
      const merged = new Map(
        previous.map((host) => [`${host.username}@${host.host}:${host.port}`, host])
      );
      for (const host of incoming) {
        merged.set(`${host.username}@${host.host}:${host.port}`, host);
      }
      return Array.from(merged.values()).slice(0, 100);
    });
  }, []);

  const connectHostExternal = useCallback(
    (host: HostProfile, options: { x11: boolean; agent: boolean }) => {
      tabSeq.current += 1;
      const id = `tab-${tabSeq.current}`;
      setTabs((previous) => [
        ...previous,
        {
          id,
          autoConnect: false,
          initialTarget: null,
          external: {
            host: host.host,
            port: host.port,
            username: host.username,
            privateKeyPath: host.privateKeyPath,
            x11: options.x11,
            agent: options.agent,
          },
        },
      ]);
      setActiveTabId(id);
      setHostsOpen(false);
    },
    []
  );

  const connectHost = useCallback((host: HostProfile) => {
    tabSeq.current += 1;
    const id = `tab-${tabSeq.current}`;
    setTabs((previous) => [
      ...previous,
      {
        id,
        autoConnect: true,
        initialTarget: hostToTarget(host),
      },
    ]);
    setActiveTabId(id);
    setHostsOpen(false);
  }, []);

  const broadcastInputToPanes = useCallback(
    (sourceTabId: string, data: string) => {
      if (!broadcastRef.current) return;
      for (const [tabId, pane] of Object.entries(paneRefs.current)) {
        if (tabId === sourceTabId || !pane) continue;
        void pane.writePty(data);
      }
    },
    []
  );

  const insertSnippet = useCallback((command: string): string | null => {
    const pane = activePaneRef.current;
    if (!pane || !linkUpRef.current) {
      return t("Connect SSH before inserting a snippet.");
    }
    void pane.writePty(command);
    pane.focus();
    return null;
  }, [t]);

  const usePluginPrompt = useCallback(
    (prompt: string): string | null => {
      if (!settings.modules.ai) return t("AI module is disabled in Settings.");
      aiSeedId.current += 1;
      setAiSeed({ id: aiSeedId.current, text: prompt });
      setPluginsOpen(false);
      setAiOpen(true);
      setSecurityOpen(false);
      setSftpOpen(false);
      setForwardOpen(false);
      setSettingsOpen(false);
      return null;
    },
    [settings.modules.ai, t]
  );

  useEffect(() => {
    if (!settings.modules.ai) setAiOpen(false);
    if (!settings.modules.security) setSecurityOpen(false);
    if (!settings.modules.sftp) setSftpOpen(false);
    if (!settings.modules.forward) setForwardOpen(false);
  }, [settings.modules]);

  const handleSnapshot = useCallback(
    (tabId: string, snapshot: SessionSnapshot) => {
      setSnapshots((previous) => ({ ...previous, [tabId]: snapshot }));
    },
    []
  );

  const persistedTabs = useMemo(
    () =>
      tabs
        .map((tab) => ({
          target: snapshots[tab.id]?.target ?? tab.initialTarget,
        }))
        .filter((entry): entry is { target: SshTarget } => entry.target !== null),
    [tabs, snapshots]
  );
  const persistedTabKey = JSON.stringify(persistedTabs);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TAB_STORAGE_KEY,
        JSON.stringify(persistedTabs)
      );
    } catch {
      // Tab persistence is best-effort; the console still works without it.
    }
    // Only rewrite when the non-secret target list changes, not every metric.
  }, [persistedTabKey]);

  useEffect(() => {
    activePaneRef.current = paneRefs.current[activeTabId] ?? null;
    linkUpRef.current =
      snapshots[activeTabId]?.linkUp ?? false;
  }, [activeTabId, snapshots]);

  useEffect(() => {
    setSftpOpen(false);
    setForwardOpen(false);
  }, [activeTabId]);

  const activeSnapshot = snapshots[activeTabId] ?? EMPTY_SNAPSHOT;
  const linkUp = activeSnapshot.linkUp;
  const termSize = activeSnapshot.termSize;
  const activeTarget = activeSnapshot.target;

  useEffect(() => {
    if (!linkUp || !activeTarget || !isTauriRuntime()) {
      setLatency({ ms: null, error: null, at: null });
      setLatencyHistory([]);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const ms = await invoke<number>("probe_tcp_latency", {
          host: activeTarget.host,
          port: activeTarget.port,
        });
        if (cancelled) return;
        setLatency({ ms, error: null, at: Date.now() });
        setLatencyHistory((previous) => [...previous.slice(-29), ms]);
      } catch (caught) {
        if (cancelled) return;
        setLatency({ ms: null, error: String(caught), at: Date.now() });
      }
    };
    void probe();
    const timer = window.setInterval(() => void probe(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [linkUp, activeTarget?.host, activeTarget?.port]);

  const time = clockOf(now);
  const date = dateOf(now);
  const offsetMinutes = -now.getTimezoneOffset();
  const tzLabel = `UTC${offsetMinutes >= 0 ? "+" : "-"}${pad2(
    Math.floor(Math.abs(offsetMinutes) / 60)
  )}:${pad2(Math.abs(offsetMinutes) % 60)}`;

  const memUsed = (memUsedBytes / 1024 ** 3).toFixed(1);
  const memTotal = (memTotalBytes / 1024 ** 3).toFixed(1);
  const memMeta =
    memTotalBytes > 0
      ? `${memUsed} / ${memTotal} GB`
      : "awaiting telemetry";

  const linkLabel =
    activeSnapshot.reconnectAttempt > 0
      ? t("ssh reconnect {attempt}/3", {
          attempt: activeSnapshot.reconnectAttempt,
        })
      : activeSnapshot.status === "connected"
        ? t("ssh link active")
        : activeSnapshot.status === "connecting"
          ? t("ssh handshake")
          : activeSnapshot.status === "closed" ||
              activeSnapshot.status === "error"
            ? t("ssh link down")
            : t("ssh link idle");

  const hostDisplay = activeTarget
    ? `${activeTarget.username}@${activeTarget.host}:${activeTarget.port}`
    : "—";

  const authLabel =
    activeTarget?.authMethod === "key"
      ? t("private key")
      : activeTarget?.authMethod === "agent"
        ? "ssh-agent"
        : activeTarget?.authMethod === "password"
          ? t("password")
          : "—";

  const keyLabel = activeSnapshot.hostKey
    ? `${activeSnapshot.hostKey.replace(/^SHA256:/, "").slice(0, 16)}…`
    : "—";

  const nodeLabel = hostname || "local";
  const uptimeLabel = formatUptime(uptime);

  const monitorHealth = !linkUp
    ? activeSnapshot.status === "connecting"
      ? "handshake"
      : activeSnapshot.status === "error" || activeSnapshot.status === "closed"
        ? "lost"
        : "idle"
    : activeSnapshot.reconnectAttempt > 0 ||
        Boolean(latency.error) ||
        (latency.ms !== null && latency.ms > 250)
      ? "degraded"
      : "healthy";
  const sessionSeconds = activeSnapshot.connectedAt
    ? Math.max(0, Math.round((now.getTime() - activeSnapshot.connectedAt) / 1000))
    : 0;
  const idleSeconds = activeSnapshot.lastActivityAt
    ? Math.max(0, Math.round((now.getTime() - activeSnapshot.lastActivityAt) / 1000))
    : null;
  const latencyPoints = latencyHistory.length
    ? latencyHistory
        .map((value, index) => {
          const x =
            latencyHistory.length === 1
              ? 100
              : (index / (latencyHistory.length - 1)) * 100;
          const y = 22 - Math.min(20, (value / 400) * 20);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";
  const peakDown = Math.max(...downHistory, 0).toFixed(1);
  const remoteMemPercent = activeSnapshot.remoteStats
    ? Math.min(
        100,
        Math.round(
          (activeSnapshot.remoteStats.memUsed /
            Math.max(1, activeSnapshot.remoteStats.memTotal)) *
            100
        )
      )
    : 0;
  const remoteDiskPercent = activeSnapshot.remoteStats
    ? Math.min(
        100,
        Math.round(
          (activeSnapshot.remoteStats.diskUsed /
            Math.max(1, activeSnapshot.remoteStats.diskTotal)) *
            100
        )
      )
    : 0;

  const aiContext = useMemo(() => {
    const diskSummary = disks
      .map(
        (disk) =>
          `${disk.mount} ${disk.percent.toFixed(0)}% (${formatGb(
            disk.used
          )}/${formatGb(disk.total)})`
      )
      .join("; ");

    const remote = activeSnapshot.remoteStats;
    return [
      `local_host=${hostname || "unknown"}`,
      `cpu=${cpu.toFixed(1)}% (${cpuBrand || "unknown"}, ${cpuCores || "?"} threads)`,
      `memory=${mem.toFixed(1)}% (${formatGb(memUsedBytes)}/${formatGb(memTotalBytes)} used)`,
      `network=rx ${down.toFixed(2)} MB/s, tx ${up.toFixed(2)} MB/s`,
      `uptime=${formatUptime(uptime)}`,
      `disks=${diskSummary || "unavailable"}`,
      `active_tab=${activeTabId}`,
      `ssh_status=${activeSnapshot.status}${activeSnapshot.reconnectAttempt ? ` (reconnect ${activeSnapshot.reconnectAttempt}/3)` : ""}`,
      activeTarget
        ? `ssh_target=${activeTarget.username}@${activeTarget.host}:${activeTarget.port}`
        : "ssh_target=offline",
      `ssh_last_error=${activeSnapshot.error ?? "none"}`,
      `terminal_size=${termSize.cols > 0 ? `${termSize.cols}x${termSize.rows}` : "unknown"}`,
      remote
        ? `remote_host=${remote.host} remote_kernel=${remote.kernel} remote_cores=${remote.cores} remote_uptime=${remote.uptime}s remote_load=${remote.load1.toFixed(2)}/${remote.load5.toFixed(2)}/${remote.load15.toFixed(2)} remote_mem=${formatGb(remote.memUsed)}/${formatGb(remote.memTotal)} remote_disk=${formatGb(remote.diskUsed)}/${formatGb(remote.diskTotal)}`
        : `remote_metrics=unavailable${activeSnapshot.remoteError ? ` (${activeSnapshot.remoteError})` : ""}`,
    ].join("\n");
  }, [
    hostname,
    cpu,
    cpuBrand,
    cpuCores,
    mem,
    memUsedBytes,
    memTotalBytes,
    down,
    up,
    uptime,
    disks,
    activeTabId,
    activeSnapshot.status,
    activeSnapshot.reconnectAttempt,
    activeSnapshot.error,
    activeSnapshot.remoteStats,
    activeSnapshot.remoteError,
    activeTarget,
    termSize,
  ]);

  useEffect(() => {
    aiContextRef.current = aiContext;
  }, [aiContext]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "Comma"
      ) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        setPluginsOpen(false);
        setHistoryOpen(false);
        setAiOpen(false);
        setSecurityOpen(false);
        setSftpOpen(false);
        setForwardOpen(false);
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "KeyP"
      ) {
        event.preventDefault();
        setPluginsOpen((open) => !open);
        setSettingsOpen(false);
        setHistoryOpen(false);
        setAiOpen(false);
        setSecurityOpen(false);
        setSftpOpen(false);
        setForwardOpen(false);
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "KeyH"
      ) {
        event.preventDefault();
        setHistoryOpen((open) => !open);
        setSettingsOpen(false);
        setPluginsOpen(false);
        setAiOpen(false);
        setSecurityOpen(false);
        setSftpOpen(false);
        setForwardOpen(false);
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "KeyO"
      ) {
        event.preventDefault();
        setHostsOpen((open) => !open);
        setSettingsOpen(false);
        setPluginsOpen(false);
        setHistoryOpen(false);
        setAiOpen(false);
        setSecurityOpen(false);
        setSftpOpen(false);
        setForwardOpen(false);
        return;
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "KeyS"
      ) {
        event.preventDefault();
        setScreenSaverOpen(true);
        return;
      }
      if (
        settings.modules.ai &&
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.code === "KeyA"
      ) {
        event.preventDefault();
        setAiOpen((open) => !open);
        setSecurityOpen(false);
        setSftpOpen(false);
        setForwardOpen(false);
        setSettingsOpen(false);
        setPluginsOpen(false);
        setHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.modules.ai]);

  const buildAiContext = useCallback((includeTerminal: boolean) => {
    const base = aiContextRef.current;
    if (!includeTerminal) return base;
    const tail = activePaneRef.current?.getBuffer(80);
    return tail
      ? `${base}\n--- terminal tail (last 80 lines) ---\n${tail}`
      : base;
  }, []);

  const closeAi = useCallback(() => setAiOpen(false), []);

  const newTab = useCallback((autoConnect = true) => {
    tabSeq.current += 1;
    const id = `tab-${tabSeq.current}`;
    setTabs((previous) => [
      ...previous,
      { id, autoConnect, initialTarget: null },
    ]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      const pane = paneRefs.current[tabId];
      pane?.cancel();
      pane?.disconnect();
      delete paneRefs.current[tabId];
      setSnapshots((previous) => {
        const next = { ...previous };
        delete next[tabId];
        return next;
      });

      const index = tabs.findIndex((tab) => tab.id === tabId);
      const remaining = tabs.filter((tab) => tab.id !== tabId);
      if (splitTabId === tabId) setSplitTabId(null);
      if (remaining.length === 0) {
        tabSeq.current += 1;
        const id = `tab-${tabSeq.current}`;
        setTabs([{ id, autoConnect: false, initialTarget: null }]);
        setActiveTabId(id);
        return;
      }

      if (splitTabId === tabId) setSplitTabId(null);
      setTabs(remaining);
      if (tabId === activeTabId) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        setActiveTabId(next.id);
      }
    },
    [activeTabId, tabs, splitTabId]
  );

  const reorderTab = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTabs((previous) => {
      const from = previous.findIndex((tab) => tab.id === fromId);
      const to = previous.findIndex((tab) => tab.id === toId);
      if (from < 0 || to < 0) return previous;
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const toggleSplit = useCallback(() => {
    if (splitTabId) {
      setSplitTabId(null);
      return;
    }
    const other = tabs.find((tab) => tab.id !== activeTabId);
    if (other) {
      setSplitTabId(other.id);
      return;
    }
    tabSeq.current += 1;
    const id = `tab-${tabSeq.current}`;
    setTabs((previous) => [
      ...previous,
      { id, autoConnect: false, initialTarget: null },
    ]);
    setSplitTabId(id);
  }, [splitTabId, tabs, activeTabId]);

  const openSessionWindow = useCallback(() => {
    const label = `session-${Date.now()}`;
    const window = new WebviewWindow(label, {
      url: import.meta.env.DEV ? "http://localhost:1420/" : "index.html",
      title: "VPS//SENTINEL — session",
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 640,
    });
    window.once("tauri://error", (event) => {
      console.warn("[ui] could not open session window:", event);
    });
  }, []);

  const handleSelectionToAi = useCallback((tabId: string, text: string) => {
    const clean = text.trim().slice(0, 6000);
    if (!clean) return;
    setActiveTabId(tabId);
    aiSeedId.current += 1;
    setAiSeed({ id: aiSeedId.current, text: clean });
    setSecurityOpen(false);
    setAiOpen(true);
  }, []);

  const askAiAboutSecurity = useCallback((text: string) => {
    aiSeedId.current += 1;
    setAiSeed({ id: aiSeedId.current, text });
    setSecurityOpen(false);
    setAiOpen(true);
  }, []);

  const handleInsertCommand = useCallback(
    (command: string): AiInsertResult => {
      const pane = activePaneRef.current;
      if (!pane || !linkUpRef.current) {
        return { ok: false, message: t("Connect SSH before inserting a command.") };
      }
      const normalized = sanitizeShellCommand(command);
      if (!normalized) {
        return { ok: false, message: t("Command is empty; nothing inserted.") };
      }

      if (/[\r\n]/.test(normalized) && !pane.bracketedPaste()) {
        void navigator.clipboard
          ?.writeText(normalized)
          .catch(() => undefined);
        return {
          ok: false,
          message: t("Multi-line command copied; bracketed paste is unavailable, so it was not inserted."),
        };
      }

      void pane.writePty(normalized);
      pane.focus();
      return { ok: true };
    },
    [t]
  );

  const runSecurityAudit = useCallback(async () => {
    const pane = activePaneRef.current;
    if (!pane) {
      throw new Error("SSH session is not connected.");
    }
    return pane.runSecurityAudit();
  }, []);

  const sftpList = useCallback((path: string) => {
    const pane = activePaneRef.current;
    if (!pane) return Promise.reject(new Error("SSH session is not connected."));
    return pane.sftpList(path);
  }, []);

  const sftpUploadChunk = useCallback(
    (path: string, offset: number, dataBase64: string, truncate: boolean) => {
      const pane = activePaneRef.current;
      if (!pane) {
        return Promise.reject(new Error("SSH session is not connected."));
      }
      return pane.sftpUploadChunk(path, offset, dataBase64, truncate);
    },
    []
  );

  const sftpDownloadChunk = useCallback(
    (path: string, offset: number, length: number) => {
      const pane = activePaneRef.current;
      if (!pane) {
        return Promise.reject(new Error("SSH session is not connected."));
      }
      return pane.sftpDownloadChunk(path, offset, length);
    },
    []
  );

  const sftpDelete = useCallback((path: string, isDir: boolean) => {
    const pane = activePaneRef.current;
    if (!pane) return Promise.reject(new Error("SSH session is not connected."));
    return pane.sftpDelete(path, isDir);
  }, []);

  const sftpRename = useCallback((from: string, to: string) => {
    const pane = activePaneRef.current;
    if (!pane) return Promise.reject(new Error("SSH session is not connected."));
    return pane.sftpRename(from, to);
  }, []);

  const sftpMkdir = useCallback((path: string) => {
    const pane = activePaneRef.current;
    if (!pane) return Promise.reject(new Error("SSH session is not connected."));
    return pane.sftpMkdir(path);
  }, []);

  const startLocalForward = useCallback(
    (bindPort: number, destHost: string, destPort: number) => {
      const pane = activePaneRef.current;
      if (!pane) {
        return Promise.reject(new Error("SSH session is not connected."));
      }
      return pane.startLocalForward(bindPort, destHost, destPort);
    },
    []
  );

  const listLocalForwards = useCallback(() => {
    const pane = activePaneRef.current;
    if (!pane) {
      return Promise.reject(new Error("SSH session is not connected."));
    }
    return pane.listLocalForwards();
  }, []);

  const stopLocalForward = useCallback((id: number) => {
    const pane = activePaneRef.current;
    if (!pane) return Promise.reject(new Error("SSH session is not connected."));
    return pane.stopLocalForward(id);
  }, []);

  const startRemoteForward = useCallback(
    async (
      remoteHost: string,
      remotePort: number,
      localHost: string,
      localPort: number
    ) => {
      if (!activePaneRef.current) {
        throw new Error("SSH session is not connected.");
      }
      return invoke<RemoteForward>("start_remote_forward", {
        sessionId: null,
        remoteHost,
        remotePort,
        localHost,
        localPort,
      });
    },
    []
  );

  const listRemoteForwards = useCallback(
    () => invoke<RemoteForward[]>("list_remote_forwards"),
    []
  );

  const stopRemoteForward = useCallback(
    (id: number) => invoke<void>("stop_remote_forward", { id }),
    []
  );

  return (
    <div
      className={`app ${settings.scanlines ? "" : "no-scanlines"} ${
        settings.reduceMotion ? "reduce-motion" : ""
      }`}
      style={
        {
          "--term-font-size": `${settings.terminalFontSize}px`,
        } as CSSProperties
      }
    >
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <div className="brand__mark" aria-hidden />
          <div className="brand__text">
            <h1 className="brand__title">
              VPS<span className="brand__slash">//</span>SENTINEL
            </h1>
            <p className="brand__sub">
              {t("remote operations console")} · {t("node")} {nodeLabel} <i className="brand__author">{t("by Mr.N")}</i>
            </p>
          </div>
        </div>

        <div className="readouts" aria-label={t("connection readouts")}>
          <div className="readout">
            <span className="readout__k">{t("node")}</span>
            <span className="readout__v">{nodeLabel}</span>
          </div>
          <div className="readout">
            <span className="readout__k">{t("link")}</span>
            <span className="readout__v">{linkUp ? t("active") : t("idle")}</span>
          </div>
          <div className="readout">
            <span className="readout__k">{t("auth")}</span>
            <span className="readout__v">{authLabel}</span>
          </div>
          <div className="readout">
            <span className="readout__k">{t("uptime")}</span>
            <span className="readout__v">{uptimeLabel}</span>
          </div>
        </div>

        <div className="clock">
          <span className="clock__time">{time}</span>
          <span className="clock__date">
            {date} <i>{tzLabel}</i>
          </span>
        </div>

        <button
          className={`topbar__settings ${hostsOpen ? "is-open" : ""}`}
          type="button"
          onClick={() => {
            setHostsOpen((open) => !open);
            setSettingsOpen(false);
            setPluginsOpen(false);
            setHistoryOpen(false);
            setAiOpen(false);
            setSecurityOpen(false);
            setSftpOpen(false);
            setForwardOpen(false);
          }}
          title={`${t("Host manager")} (Ctrl+Shift+O)`}
          aria-label={t("Host manager")}
          aria-expanded={hostsOpen}
        >
          ⌂
        </button>

        <button
          className="topbar__settings"
          type="button"
          onClick={() => setScreenSaverOpen(true)}
          title={`${t("Screen saver")} (Ctrl+Shift+S)`}
          aria-label={t("Screen saver")}
        >
          ◐
        </button>

        <button
          className={`topbar__settings ${pluginsOpen ? "is-open" : ""}`}
          type="button"
          onClick={() => {
            setPluginsOpen((open) => !open);
            setSettingsOpen(false);
            setHistoryOpen(false);
            setAiOpen(false);
            setSecurityOpen(false);
            setSftpOpen(false);
            setForwardOpen(false);
          }}
          title={t("Plugin hub (Ctrl+Shift+P)")}
          aria-label={t("Plugin hub")}
          aria-expanded={pluginsOpen}
        >
          ▦
        </button>

        <button
          className={`topbar__settings ${historyOpen ? "is-open" : ""}`}
          type="button"
          onClick={() => {
            setHistoryOpen((open) => !open);
            setSettingsOpen(false);
            setPluginsOpen(false);
            setAiOpen(false);
            setSecurityOpen(false);
            setSftpOpen(false);
            setForwardOpen(false);
          }}
          title={t("Session history (Ctrl+Shift+H)")}
          aria-label={t("Session history")}
          aria-expanded={historyOpen}
        >
          ◷
        </button>

        <button
          className={`topbar__settings ${settingsOpen ? "is-open" : ""}`}
          type="button"
          onClick={() => {
            setSettingsOpen((open) => !open);
            setPluginsOpen(false);
            setHistoryOpen(false);
            setAiOpen(false);
            setSecurityOpen(false);
            setSftpOpen(false);
            setForwardOpen(false);
          }}
          title={t("Settings (Ctrl+,)")}
          aria-label={t("Settings")}
          aria-expanded={settingsOpen}
        >
          ⚙
        </button>

        <div className="topbar__windowbtns">
          <button
            type="button"
            title={t("minimise")}
            aria-label={t("minimise")}
            onClick={() => {
              if (!isTauriRuntime()) return;
              void getCurrentWindow().minimize();
            }}
          >
            –
          </button>
          <button
            type="button"
            title={isMaximized ? t("restore") : t("maximise")}
            aria-label={isMaximized ? t("restore") : t("maximise")}
            onClick={() => {
              if (!isTauriRuntime()) return;
              const appWindow = getCurrentWindow();
              void appWindow.isMaximized().then((maximized) => {
                if (maximized) {
                  void appWindow.unmaximize();
                } else {
                  void appWindow.maximize();
                }
              });
            }}
          >
            {isMaximized ? "❐" : "□"}
          </button>
          <button
            type="button"
            className="topbar__windowclose"
            title={t("close window")}
            aria-label={t("close window")}
            onClick={() => {
              if (!isTauriRuntime()) return;
              void getCurrentWindow().close();
            }}
          >
            ×
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label={t("system telemetry")}>
          <Panel
            label={t("core telemetry")}
            code="SYS-01"
            meta={<span className="live">{t("local host")}</span>}
          >
            <div className="gauges">
              <Gauge
                label={t("cpu")}
                value={cpu}
                meta={`${cpuCores || "—"} ${t("threads")} · ${t("local")}`}
              />
              <Gauge label={t("memory")} value={mem} meta={memMeta} />
            </div>
            <div className="kv">
              <div className="kv__row">
                <span className="kv__k">{t("host")}</span>
                <span className="kv__v">{hostname || "—"}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("cpu")}</span>
                <span className="kv__v" title={cpuBrand}>
                  {cpuBrand || "—"}
                </span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("memory")}</span>
                <span className="kv__v">{memMeta}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("uptime")}</span>
                <span className="kv__v">{uptimeLabel}</span>
              </div>
            </div>
          </Panel>

          <Panel
            label={t("network throughput")}
            code="NET-02"
            meta={<span className="live">{t("local")}</span>}
          >
            <div className="net-stats">
              <div className="net-stat">
                <span className="net-stat__k">{t("downlink")}</span>
                <span className="net-stat__v">
                  <em>↓</em>
                  {down.toFixed(1)}
                  <i>MB/s</i>
                </span>
              </div>
              <div className="net-stat">
                <span className="net-stat__k">{t("uplink")}</span>
                <span className="net-stat__v">
                  <em>↑</em>
                  {up.toFixed(1)}
                  <i>MB/s</i>
                </span>
              </div>
            </div>
            <NetworkChart down={downHistory} up={upHistory} />
            <div className="net-foot">
              <span>{t("peak {value} MB/s", { value: peakDown })}</span>
              <span>{t("all interfaces")}</span>
              <span>{t("1s sample")}</span>
            </div>
          </Panel>

          <Panel label={t("storage array")} code="DSK-03" meta={t("local")}>
            <div className="disks">
              {disks.length === 0 ? (
                <p className="panel-empty">{t("awaiting disk telemetry…")}</p>
              ) : (
                disks.map((disk) => (
                  <div className="disk" key={disk.mount}>
                    <div className="disk__top">
                      <span className="disk__mount">
                        {disk.mount || "volume"}
                      </span>
                      <span className="disk__pct">
                        {Math.round(disk.percent)}%
                      </span>
                      <span className="disk__size">
                        {formatGb(disk.used)}G / {formatGb(disk.total)}G
                      </span>
                    </div>
                    <div className="disk__bar">
                      <span style={{ width: `${disk.percent}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            label={t("link session")}
            code="SSH-04"
            meta={linkUp ? t("active") : t(activeSnapshot.status)}
            className="panel--grow"
          >
            <div className="kv">
              <div className="kv__row">
                <span className="kv__k">{t("host")}</span>
                <span className="kv__v">{activeTarget?.host ?? "—"}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("user")}</span>
                <span className="kv__v">{activeTarget?.username ?? "—"}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("auth")}</span>
                <span className="kv__v">{authLabel}</span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("pty")}</span>
                <span className="kv__v">
                  {termSize.cols > 0
                    ? `${termSize.cols} × ${termSize.rows}`
                    : "—"}
                </span>
              </div>
              <div className="kv__row">
                <span className="kv__k">{t("host key")}</span>
                <span className="kv__v" title={activeSnapshot.hostKey ?? undefined}>
                  {keyLabel}
                </span>
              </div>
              {activeSnapshot.remoteStats ? (
                <>
                  <div className="kv__row">
                    <span className="kv__k">{t("remote load")}</span>
                    <span className="kv__v">
                      {activeSnapshot.remoteStats.load1.toFixed(2)} /{" "}
                      {activeSnapshot.remoteStats.load5.toFixed(2)} /{" "}
                      {activeSnapshot.remoteStats.load15.toFixed(2)}
                    </span>
                  </div>
                  <div className="kv__row">
                    <span className="kv__k">{t("remote mem")}</span>
                    <span className="kv__v">
                      {formatGb(activeSnapshot.remoteStats.memUsed)} /{" "}
                      {formatGb(activeSnapshot.remoteStats.memTotal)}
                    </span>
                  </div>
                  <div className="kv__row">
                    <span className="kv__k">{t("remote disk")}</span>
                    <span className="kv__v">
                      {formatGb(activeSnapshot.remoteStats.diskUsed)} /{" "}
                      {formatGb(activeSnapshot.remoteStats.diskTotal)}
                    </span>
                  </div>
                  <div className="kv__row">
                    <span className="kv__k">{t("remote kernel")}</span>
                    <span className="kv__v">
                      {activeSnapshot.remoteStats.kernel || "—"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="kv__row">
                  <span className="kv__k">{t("remote metrics")}</span>
                  <span className="kv__v">
                    {activeSnapshot.remoteError ??
                      (linkUp ? t("probing…") : "—")}
                  </span>
                </div>
              )}
            </div>

            {activeSnapshot.remoteStats ? (
              <div className="remote-gauges">
                <div className="remote-gauge">
                  <span>CPU</span>
                  <b>{Math.round(activeSnapshot.remoteStats.cpuPercent)}%</b>
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        activeSnapshot.remoteStats.cpuPercent
                      )}%`,
                    }}
                  />
                </div>
                <div className="remote-gauge">
                  <span>RAM</span>
                  <b>{remoteMemPercent}%</b>
                  <i style={{ width: `${remoteMemPercent}%` }} />
                </div>
                <div className="remote-gauge">
                  <span>DISK</span>
                  <b>{remoteDiskPercent}%</b>
                  <i style={{ width: `${remoteDiskPercent}%` }} />
                </div>
                <div className="remote-gauge">
                  <span>NET</span>
                  <b>
                    ↓ {formatBytesShort(activeSnapshot.remoteStats.netRx)}/s · ↑{" "}
                    {formatBytesShort(activeSnapshot.remoteStats.netTx)}/s
                  </b>
                </div>
              </div>
            ) : null}

            <div className="ssh-monitor">
              <div className="ssh-monitor__head">
                <span>{t("ssh monitor")}</span>
                <b className={`ssh-health is-${monitorHealth}`}>
                  {t(monitorHealth)}
                </b>
              </div>
              <div className="ssh-monitor__grid">
                <div>
                  <span>{t("latency")}</span>
                  <b title={latency.error ?? undefined}>
                    {latency.ms !== null
                      ? `${latency.ms} ms`
                      : latency.error
                        ? t("unreachable")
                        : "—"}
                  </b>
                </div>
                <div>
                  <span>{t("session")}</span>
                  <b>{sessionSeconds > 0 ? formatUptime(sessionSeconds) : "—"}</b>
                </div>
                <div>
                  <span>{t("traffic")}</span>
                  <b>
                    ↓ {formatBytesShort(activeSnapshot.bytesIn)} / ↑{" "}
                    {formatBytesShort(activeSnapshot.bytesOut)}
                  </b>
                </div>
                <div>
                  <span>{t("idle")}</span>
                  <b>{idleSeconds === null ? "—" : `${idleSeconds}s`}</b>
                </div>
                <div>
                  <span>{t("keepalive")}</span>
                  <b>20s</b>
                </div>
                <div>
                  <span>{t("reconnects")}</span>
                  <b>{activeSnapshot.reconnectAttempt}/3</b>
                </div>
              </div>
              <svg
                className="ssh-latency-chart"
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                aria-label={t("latency history")}
              >
                <line x1="0" y1="22" x2="100" y2="22" />
                {latencyPoints ? (
                  <polyline points={latencyPoints} />
                ) : null}
              </svg>
            </div>

            <div className="proc-foot">
              <span className="live">
                {linkUp ? t("encrypted") : t("offline")}
                {activeSnapshot.remoteStats ? ` · ${t("remote")}` : ""}
              </span>
              <span>{t(activeSnapshot.status)}</span>
            </div>
          </Panel>
        </aside>

        <section className="terminal" aria-label={t("ssh terminal")}>
          <Corners large />
          <div className="terminal__scan" aria-hidden />

          <div className="terminal__tabstrip">
            <div className="terminal__tabs">
              {tabs.map((tab) => {
                const snapshot = snapshots[tab.id] ?? EMPTY_SNAPSHOT;
                const target = snapshot.target ?? tab.initialTarget;
                const label = tab.external
                  ? `${tab.external.host} · X11/A`
                  : target?.host ??
                    (snapshot.status === "connecting"
                      ? t("handshaking…")
                      : t("new link"));
                return (
                  <div
                    className={`terminal__tabwrap ${
                      tab.id === activeTabId ? "is-active" : ""
                    } ${draggingTab === tab.id ? "is-dragging" : ""}`}
                    key={tab.id}
                  >
                    <button
                      className={`terminal__tab ${
                        tab.id === activeTabId ? "is-active" : ""
                      }`}
                      type="button"
                      draggable
                      onClick={() => setActiveTabId(tab.id)}
                      onDragStart={(event) => {
                        setDraggingTab(tab.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", tab.id);
                      }}
                      onDragOver={(event) => {
                        if (draggingTab && draggingTab !== tab.id) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from =
                          event.dataTransfer.getData("text/plain") ||
                          draggingTab;
                        if (from) reorderTab(from, tab.id);
                        setDraggingTab(null);
                      }}
                      onDragEnd={() => setDraggingTab(null)}
                    >
                      <span
                        className={`tabdot ${
                          snapshot.linkUp ? "" : "tabdot--idle"
                        }`}
                        aria-hidden
                      />
                      {tab.external ? "openssh" : "ssh"} · {label}
                    </button>
                    <button
                      className="terminal__tabclose"
                      type="button"
                      aria-label={t("close {name}", { name: label })}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                className="terminal__tab terminal__tab--add"
                type="button"
                onClick={() => newTab(true)}
                title={t("new tab")}
                aria-label={t("new tab")}
              >
                +
              </button>
              <button
                className="terminal__tab terminal__tab--add"
                type="button"
                onClick={openSessionWindow}
                title={t("new window")}
                aria-label={t("new window")}
              >
                ⧉
              </button>
              <button
                className={`terminal__tab terminal__tab--add ${
                  splitTabId ? "is-split" : ""
                }`}
                type="button"
                onClick={toggleSplit}
                title={splitTabId ? t("close split view") : t("split view")}
                aria-label={splitTabId ? t("close split view") : t("split view")}
                aria-pressed={Boolean(splitTabId)}
              >
                ◫
              </button>
            </div>
          </div>

          <div className={`terminal-stack ${splitTabId ? "is-split" : ""}`}>
            {tabs.map((tab) =>
              tab.external ? (
                <OpenSshPane
                  key={tab.id}
                  config={tab.external}
                  theme={terminalTheme}
                  fontSize={settings.terminalFontSize}
                  active={tab.id === activeTabId || tab.id === splitTabId}
                  onClose={() => closeTab(tab.id)}
                />
              ) : (
              <TerminalPane
                key={tab.id}
                tabId={tab.id}
                active={tab.id === activeTabId || tab.id === splitTabId}
                autoConnect={tab.autoConnect}
                initialTarget={tab.initialTarget}
                defaults={{
                  port: settings.defaultSshPort,
                  username: settings.defaultSshUsername,
                  autoReconnect: settings.defaultAutoReconnect,
                }}
                terminalTheme={terminalTheme}
                terminalFontSize={settings.terminalFontSize}
                broadcastInput={broadcastInput}
                onBroadcastInput={broadcastInputToPanes}
                onToggleBroadcast={() => setBroadcastInput((value) => !value)}
                modules={settings.modules}
                aiOpen={aiOpen}
                securityOpen={securityOpen}
                onSnapshot={handleSnapshot}
                onSelectionToAi={handleSelectionToAi}
                onOpenAi={() => {
                  setAiOpen(true);
                  setSecurityOpen(false);
                  setSftpOpen(false);
                  setForwardOpen(false);
                }}
                onOpenSecurity={() => {
                  setSecurityOpen(true);
                  setAiOpen(false);
                  setSftpOpen(false);
                  setForwardOpen(false);
                }}
                onOpenSftp={() => {
                  setSftpOpen(true);
                  setAiOpen(false);
                  setSecurityOpen(false);
                  setForwardOpen(false);
                }}
                onOpenForward={() => {
                  setForwardOpen(true);
                  setAiOpen(false);
                  setSecurityOpen(false);
                  setSftpOpen(false);
                }}
                ref={(handle) => {
                  paneRefs.current[tab.id] = handle;
                  if (tab.id === activeTabId) {
                    activePaneRef.current = handle;
                  }
                }}
              />
              )
            )}
          </div>
        </section>
      </div>

      {settings.modules.ai ? (
        <AiAssistant
          open={aiOpen}
          onClose={closeAi}
          buildContext={buildAiContext}
          contextAvailable={Boolean(hostname || linkUp || activeSnapshot.error)}
          canInsert={linkUp}
          onInsert={handleInsertCommand}
          seed={aiSeed}
        />
      ) : null}

      {settings.modules.security ? (
        <SecurityPanel
          open={securityOpen}
          onClose={() => setSecurityOpen(false)}
          canScan={linkUp}
          onAskAi={askAiAboutSecurity}
          onRun={runSecurityAudit}
        />
      ) : null}

      {settings.modules.sftp ? (
        <SftpPanel
          open={sftpOpen}
          canBrowse={linkUp}
          onClose={() => setSftpOpen(false)}
          downloadDirectory={settings.downloadDirectory}
          list={sftpList}
          downloadChunk={sftpDownloadChunk}
          uploadChunk={sftpUploadChunk}
          remove={sftpDelete}
          rename={sftpRename}
          mkdir={sftpMkdir}
        />
      ) : null}

      {settings.modules.forward ? (
        <ForwardPanel
          open={forwardOpen}
          canForward={linkUp}
          onClose={() => setForwardOpen(false)}
          start={startLocalForward}
          list={listLocalForwards}
          stop={stopLocalForward}
          startRemote={startRemoteForward}
          listRemote={listRemoteForwards}
          stopRemote={stopRemoteForward}
        />
      ) : null}

      <PluginsPanel
        open={pluginsOpen}
        onClose={() => setPluginsOpen(false)}
        plugins={plugins}
        disabledIds={pluginState.disabled}
        onToggle={togglePlugin}
        onInstall={installPlugin}
        onRemove={removePlugin}
        canInsert={linkUp}
        aiEnabled={settings.modules.ai}
        onInsertSnippet={insertSnippet}
        onUsePrompt={usePluginPrompt}
      />

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={updateSettings}
        onOpenAi={() => {
          setSettingsOpen(false);
          if (settings.modules.ai) setAiOpen(true);
        }}
        themes={themes}
        activeThemeId={activeTheme.id}
        onApplyTheme={applyThemeById}
        onInstallTheme={installTheme}
        onRemoveTheme={removeTheme}
      />

      <footer className="statusbar">
        <div className="statusbar__group">
          <span
            className={`statusbar__item statusbar__item--link ${linkUp ? "" : "is-idle"}`}
          >
            <i className={`led ${linkUp ? "" : "led--idle"}`} aria-hidden />
            {linkLabel}
          </span>
          <span className="statusbar__sep" aria-hidden />
          <span className="statusbar__item">
            <span>{t("host")}</span>
            <b>{hostDisplay}</b>
          </span>
          <span className="statusbar__item">
            <span>{t("auth")}</span>
            <b>{authLabel}</b>
          </span>
          <span className="statusbar__item">
            <span>{t("pty")}</span>
            <b>
              {termSize.cols > 0 ? `${termSize.cols} × ${termSize.rows}` : "—"}
            </b>
          </span>
          <span className="statusbar__item statusbar__item--remote">
            <span>{t("remote")}</span>
            <b>
              {activeSnapshot.remoteStats
                ? `load ${activeSnapshot.remoteStats.load1.toFixed(2)} · mem ${Math.round(
                    (activeSnapshot.remoteStats.memUsed /
                      Math.max(1, activeSnapshot.remoteStats.memTotal)) *
                      100
                  )}%`
                : activeSnapshot.remoteError
                  ? "err"
                  : "—"}
            </b>
          </span>
        </div>

        <div className="statusbar__group statusbar__group--hide-sm">
          <span className="statusbar__item">
            <span>io</span>
            <b>
              ↓ {down.toFixed(1)} / ↑ {up.toFixed(1)} MB/s
            </b>
          </span>
          <span className="statusbar__item">
            <span>{t("host key")}</span>
            <b title={activeSnapshot.hostKey ?? undefined}>{keyLabel}</b>
          </span>
          <span className="statusbar__item">
            <span>{t("node")}</span>
            <b>{hostname || "local"}</b>
          </span>
        </div>

        <div className="statusbar__group statusbar__group--right">
          <span className="statusbar__item">
            <b>{time}</b>
            <span>{tzLabel}</span>
          </span>
          <span className="statusbar__brand">{t("sentinel v0.9.4")}</span>
        </div>
      </footer>

      <HostsPanel
        open={hostsOpen}
        onClose={() => setHostsOpen(false)}
        hosts={hosts}
        onSave={saveHost}
        onRemove={removeHost}
        onConnect={connectHost}
        onConnectExternal={connectHostExternal}
        onImport={importHosts}
        currentTarget={activeTarget}
        defaults={{
          port: settings.defaultSshPort,
          username: settings.defaultSshUsername,
          autoReconnect: settings.defaultAutoReconnect,
        }}
      />

      <ScreenSaver
        active={screenSaverOpen}
        onExit={() => setScreenSaverOpen(false)}
      />
    </div>
  );
}
