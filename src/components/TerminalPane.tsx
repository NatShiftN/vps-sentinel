import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useSshSession } from "../hooks/useSshSession";
import type {
  HostKeyPrompt,
  RemoteStats,
  SshConfig,
  SshStatus,
  SshTarget,
} from "../hooks/useSshSession";
import type { SecurityAudit } from "../lib/security";
import type {
  SftpChunk,
  SftpDownload,
  SftpListing,
} from "../lib/sftp";
import type { LocalForward } from "../lib/forward";
import { SshConnectDialog } from "./SshConnectDialog";
import { useI18n } from "../lib/i18n";
import { isTauriRuntime } from "../lib/tauri";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  XTermTerminal,
  type XTermHandle,
  type XTermTheme,
} from "./XTermTerminal";

const LOGO = `██████ ██████ ██  ██ ██████   ██   ██  ██ ██████ ██    
██     ██     ██  ██   ██     ██   ██  ██ ██     ██    
█████  █████  ███ ██   ██     ██   ███ ██ █████  ██    
    ██ ██     ██ ███   ██     ██   ██ ███ ██     ██    
█████  █████  ██  ██   ██     ██   ██  ██ ██████ ██████`;

export type SessionSnapshot = {
  status: SshStatus;
  target: SshTarget | null;
  hostKey: string | null;
  remoteStats: RemoteStats | null;
  remoteError: string | null;
  error: string | null;
  reconnectAttempt: number;
  termSize: { cols: number; rows: number };
  hasSession: boolean;
  linkUp: boolean;
  bytesIn: number;
  bytesOut: number;
  lastActivityAt: number | null;
  connectedAt: number | null;
};

export type TerminalPaneHandle = {
  openConnect: () => void;
  disconnect: () => void;
  cancel: () => void;
  writePty: (data: string) => Promise<void>;
  runSecurityAudit: () => Promise<SecurityAudit>;
  sftpList: (path: string) => Promise<SftpListing>;
  sftpDownload: (path: string) => Promise<SftpDownload>;
  sftpUpload: (path: string, file: File) => Promise<number>;
  sftpDelete: (path: string, isDir: boolean) => Promise<void>;
  sftpRename: (from: string, to: string) => Promise<void>;
  sftpMkdir: (path: string) => Promise<void>;
  sftpDownloadChunk: (
    path: string,
    offset: number,
    length: number
  ) => Promise<SftpChunk>;
  sftpUploadChunk: (
    path: string,
    offset: number,
    dataBase64: string,
    truncate: boolean
  ) => Promise<number>;
  startLocalForward: (
    bindPort: number,
    destHost: string,
    destPort: number
  ) => Promise<LocalForward>;
  listLocalForwards: () => Promise<LocalForward[]>;
  stopLocalForward: (id: number) => Promise<void>;
  getBuffer: (maxLines?: number) => string;
  bracketedPaste: () => boolean;
  focus: () => void;
};

export type ConnectionDefaults = {
  port: number;
  username: string;
  autoReconnect: boolean;
};

type Props = {
  tabId: string;
  active: boolean;
  autoConnect?: boolean;
  initialTarget?: SshTarget | null;
  defaults: ConnectionDefaults;
  terminalTheme: XTermTheme;
  terminalFontSize: number;
  broadcastInput: boolean;
  onBroadcastInput: (tabId: string, data: string) => void;
  onToggleBroadcast: () => void;
  modules: {
    ai: boolean;
    sftp: boolean;
    forward: boolean;
    security: boolean;
  };
  aiOpen: boolean;
  securityOpen: boolean;
  onSnapshot: (tabId: string, snapshot: SessionSnapshot) => void;
  onSelectionToAi: (tabId: string, text: string) => void;
  onOpenAi: () => void;
  onOpenSecurity: () => void;
  onOpenSftp: () => void;
  onOpenForward: () => void;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function TerminalPane(
    {
      tabId,
      active,
      autoConnect,
      initialTarget,
      defaults,
      terminalTheme,
      terminalFontSize,
      broadcastInput,
      onBroadcastInput,
      onToggleBroadcast,
      modules,
      aiOpen,
      securityOpen,
      onSnapshot,
      onSelectionToAi,
      onOpenAi,
      onOpenSecurity,
      onOpenSftp,
      onOpenForward,
    },
    ref
  ) {
    const [hasSession, setHasSession] = useState(false);
    const [termSize, setTermSize] = useState({ cols: 0, rows: 0 });
    const [connectedAt, setConnectedAt] = useState<number | null>(null);
    const [traffic, setTraffic] = useState({
      in: 0,
      out: 0,
      lastActivityAt: null as number | null,
    });
    const { t } = useI18n();
    const [windowMaximized, setWindowMaximized] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMiss, setSearchMiss] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);
    const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPrompt | null>(
      null
    );

    const xtermRef = useRef<XTermHandle>(null);
    const hasSessionRef = useRef(false);
    const connectingRef = useRef(false);
    const pendingWrites = useRef<string[]>([]);
    const handshakeBuffer = useRef<string[]>([]);
    const autoOpened = useRef(false);
    const bytesInRef = useRef(0);
    const bytesOutRef = useRef(0);
    const lastActivityRef = useRef<number | null>(null);
    const lastStatusRef = useRef<SshStatus>("idle");

    const writeToTerminal = useCallback((chunk: string) => {
      if (!chunk) return;
      bytesInRef.current += new TextEncoder().encode(chunk).length;
      lastActivityRef.current = Date.now();
      if (connectingRef.current) {
        if (handshakeBuffer.current.length < 256) {
          handshakeBuffer.current.push(chunk);
        }
        return;
      }
      if (!hasSessionRef.current) return;
      if (xtermRef.current) {
        xtermRef.current.write(chunk);
      } else if (pendingWrites.current.length < 256) {
        pendingWrites.current.push(chunk);
      }
    }, []);

    const flushPendingWrites = useCallback(() => {
      const term = xtermRef.current;
      if (!term) return;
      const queued = pendingWrites.current;
      pendingWrites.current = [];
      queued.forEach((chunk) => term.write(chunk));
      term.focus();
    }, []);

    const ssh = useSshSession(writeToTerminal);
    const sshRef = useRef(ssh);
    useEffect(() => {
      sshRef.current = ssh;
    }, [ssh]);

    useEffect(() => {
      hasSessionRef.current = hasSession;
    }, [hasSession]);

    useEffect(() => {
      const previous = lastStatusRef.current;
      if (ssh.status === "connected" && previous !== "connected") {
        setConnectedAt(Date.now());
        bytesInRef.current = 0;
        bytesOutRef.current = 0;
        lastActivityRef.current = null;
      } else if (ssh.status === "idle") {
        setConnectedAt(null);
        bytesInRef.current = 0;
        bytesOutRef.current = 0;
        lastActivityRef.current = null;
      }
      lastStatusRef.current = ssh.status;
    }, [ssh.status]);

    useEffect(() => {
      const timer = window.setInterval(() => {
        setTraffic((previous) => {
          const last = lastActivityRef.current;
          if (
            previous.in === bytesInRef.current &&
            previous.out === bytesOutRef.current &&
            previous.lastActivityAt === last
          ) {
            return previous;
          }
          return {
            in: bytesInRef.current,
            out: bytesOutRef.current,
            lastActivityAt: last,
          };
        });
      }, 1000);
      return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
      onSnapshot(tabId, {
        status: ssh.status,
        target: ssh.target,
        hostKey: ssh.hostKey,
        remoteStats: ssh.remoteStats,
        remoteError: ssh.remoteError,
        error: ssh.error,
        reconnectAttempt: ssh.reconnectAttempt,
        termSize,
        hasSession,
        linkUp: ssh.status === "connected",
        bytesIn: traffic.in,
        bytesOut: traffic.out,
        lastActivityAt: traffic.lastActivityAt,
        connectedAt,
      });
    }, [
      tabId,
      onSnapshot,
      ssh.status,
      ssh.target,
      ssh.hostKey,
      ssh.remoteStats,
      ssh.remoteError,
      ssh.error,
      ssh.reconnectAttempt,
      termSize,
      hasSession,
      traffic,
      connectedAt,
    ]);

    useEffect(() => {
      if (ssh.status === "closed") {
        writeToTerminal("\r\n[ssh] session closed\r\n");
      }
    }, [ssh.status]);

    useEffect(() => {
      if (ssh.error && !connectOpen) {
        writeToTerminal(`\r\n[ssh] ${ssh.error}\r\n`);
      }
    }, [ssh.error, connectOpen]);

    useEffect(() => {
      if (!active) return;
      const timer = window.setTimeout(() => {
        xtermRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }, [active, hasSession]);

    useEffect(() => {
      if (!active && connectOpen) {
        if (connecting) {
          void sshRef.current.cancel();
        }
        setConnectOpen(false);
        setHostKeyPrompt(null);
        setConnectError(null);
      }
    }, [active, connectOpen, connecting]);

    const openConnect = () => {
      setConnectError(null);
      setHostKeyPrompt(null);
      setConnectOpen(true);
    };

    const cancelConnect = () => {
      void ssh.cancel();
      setConnecting(false);
      connectingRef.current = false;
      setConnectOpen(false);
      setConnectError(null);
      setHostKeyPrompt(null);
    };

    const closeConnect = () => {
      if (connecting) {
        cancelConnect();
      } else {
        setConnectOpen(false);
        setConnectError(null);
        setHostKeyPrompt(null);
      }
    };

    const handleConnect = async (
      config: SshConfig,
      trust?: { hostKey: string; replace: boolean }
    ) => {
      setConnecting(true);
      setConnectError(null);
      setHostKeyPrompt(null);
      connectingRef.current = true;
      handshakeBuffer.current = [];
      pendingWrites.current = [];

      const result = await ssh.connect(config, trust);
      setConnecting(false);
      connectingRef.current = false;

      if (result.kind === "cancelled") {
        handshakeBuffer.current = [];
        setConnectOpen(false);
        return;
      }
      if (result.kind === "hostKey") {
        handshakeBuffer.current = [];
        setHostKeyPrompt(result.prompt);
        return;
      }
      if (result.kind === "error") {
        handshakeBuffer.current = [];
        setConnectError(result.message);
        return;
      }

      const buffered = handshakeBuffer.current.join("");
      handshakeBuffer.current = [];
      xtermRef.current?.reset();
      setHasSession(true);
      hasSessionRef.current = true;
      writeToTerminal(
        `[ssh] connected to ${config.username}@${config.host}:${config.port}\r\n` +
          buffered
      );
      setConnectOpen(false);
    };

    const handleDisconnect = () => {
      void ssh.disconnect();
    };

    const handleUserInput = (data: string) => {
      bytesOutRef.current += new TextEncoder().encode(data).length;
      lastActivityRef.current = Date.now();
      void ssh.handleUserInput(data);
      if (broadcastInput && data) {
        onBroadcastInput(tabId, data);
      }
    };

    const handleTerminalResize = (cols: number, rows: number) => {
      setTermSize({ cols, rows });
      void ssh.resize(cols, rows);
    };

    const focus = () => {
      if (hasSession) {
        xtermRef.current?.focus();
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        openConnect,
        disconnect: () => void sshRef.current.disconnect(),
        cancel: () => void sshRef.current.cancel(),
        writePty: (data: string) => sshRef.current.writePty(data),
        runSecurityAudit: () => sshRef.current.runSecurityAudit(),
        sftpList: (path: string) => sshRef.current.sftpList(path),
        sftpDownload: (path: string) => sshRef.current.sftpDownload(path),
        sftpUpload: (path: string, file: File) =>
          sshRef.current.sftpUpload(path, file),
        sftpDelete: (path: string, isDir: boolean) =>
          sshRef.current.sftpDelete(path, isDir),
        sftpRename: (from: string, to: string) =>
          sshRef.current.sftpRename(from, to),
        sftpMkdir: (path: string) => sshRef.current.sftpMkdir(path),
        sftpDownloadChunk: (path: string, offset: number, length: number) =>
          sshRef.current.sftpDownloadChunk(path, offset, length),
        sftpUploadChunk: (
          path: string,
          offset: number,
          dataBase64: string,
          truncate: boolean
        ) =>
          sshRef.current.sftpUploadChunk(
            path,
            offset,
            dataBase64,
            truncate
          ),
        startLocalForward: (
          bindPort: number,
          destHost: string,
          destPort: number
        ) => sshRef.current.startLocalForward(bindPort, destHost, destPort),
        listLocalForwards: () => sshRef.current.listLocalForwards(),
        stopLocalForward: (id: number) =>
          sshRef.current.stopLocalForward(id),
        getBuffer: (maxLines = 80) =>
          xtermRef.current?.getBuffer(maxLines) ?? "",
        bracketedPaste: () => xtermRef.current?.bracketedPaste() ?? false,
        focus,
      }),
      [hasSession]
    );

    useEffect(() => {
      if (!autoConnect || autoOpened.current) return;
      autoOpened.current = true;
      openConnect();
    }, [autoConnect]);

    const linkUp = ssh.status === "connected";

    useEffect(() => {
      if (!active) return;
      const onKey = (event: globalThis.KeyboardEvent) => {
        if (event.ctrlKey && !event.shiftKey && event.code === "KeyF") {
          event.preventDefault();
          setSearchOpen(true);
        } else if (event.key === "Escape" && searchOpen) {
          setSearchOpen(false);
          xtermRef.current?.clearSearch();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [active, searchOpen]);

    const runSearch = (direction: "next" | "previous", query = searchQuery) => {
      if (!query || !xtermRef.current) return;
      const found =
        direction === "next"
          ? xtermRef.current.findNext(query)
          : xtermRef.current.findPrevious(query);
      setSearchMiss(!found);
    };

    useEffect(() => {
      if (!isTauriRuntime()) return;
      const appWindow = getCurrentWindow();
      let unlisten: (() => void) | undefined;
      void appWindow.isMaximized().then(setWindowMaximized).catch(() => undefined);
      void appWindow
        .onResized(() => {
          void appWindow
            .isMaximized()
            .then(setWindowMaximized)
            .catch(() => undefined);
        })
        .then((cleanup) => {
          unlisten = cleanup;
        })
        .catch(() => undefined);
      return () => unlisten?.();
    }, []);

    return (
      <div className={`terminal-pane ${active ? "is-active" : ""}`}>
        <header className="terminal__bar">
          <button
            className={`terminal__link ${linkUp ? "is-live" : ""}`}
            type="button"
            onClick={linkUp ? handleDisconnect : openConnect}
            disabled={connecting}
          >
            {linkUp
              ? t("disconnect")
              : connecting
                ? t("handshaking…")
                : t("connect")}
          </button>

          {modules.ai ? (
            <button
              className={`terminal__ai ${aiOpen ? "is-open" : ""}`}
              type="button"
              onClick={onOpenAi}
              aria-expanded={aiOpen}
              title={t("AI assistant")}
            >
              ai
            </button>
          ) : null}

          {modules.security ? (
            <button
              className={`terminal__ai terminal__sec ${
                securityOpen ? "is-open" : ""
              }`}
              type="button"
              onClick={onOpenSecurity}
              aria-expanded={securityOpen}
              title={t("Read-only security audit")}
            >
              sec
            </button>
          ) : null}

          {modules.sftp ? (
            <button
              className="terminal__ai terminal__sftp"
              type="button"
              onClick={onOpenSftp}
              aria-disabled={!linkUp}
              title={t("SFTP file browser (active tab)")}
            >
              sftp
            </button>
          ) : null}

          {modules.forward ? (
            <button
              className="terminal__ai terminal__fwd"
              type="button"
              onClick={onOpenForward}
              aria-disabled={!linkUp}
              title={t("Local port forwarding (active tab)")}
            >
              fwd
            </button>
          ) : null}

          <button
            className="terminal__ai terminal__searchbtn"
            type="button"
            onClick={() => setSearchOpen(true)}
            title={t("find in terminal")}
            aria-label={t("find in terminal")}
          >
            ⌕
          </button>

          <button
            className={`terminal__ai terminal__broadcast ${
              broadcastInput ? "is-broadcast" : ""
            }`}
            type="button"
            onClick={onToggleBroadcast}
            title={t("broadcast input to all sessions")}
            aria-pressed={broadcastInput}
          >
            ⇉
          </button>

          <div className="terminal__meta">
            <span>
              {hasSession && termSize.cols > 0
                ? `${termSize.cols} × ${termSize.rows}`
                : "— × —"}
            </span>
            <span>utf-8</span>
            <span>pty</span>
            <span className="terminal__pane-host">
              {ssh.target?.host ?? initialTarget?.host ?? t("offline")}
            </span>
          </div>

          <div className="terminal__winbtns">
            <button
              className="winbtn"
              type="button"
              aria-label={t("minimise")}
              title={t("minimise")}
              onClick={() => {
                if (!isTauriRuntime()) return;
                void getCurrentWindow().minimize();
              }}
            >
              –
            </button>
            <button
              className="winbtn"
              type="button"
              aria-label={windowMaximized ? t("restore") : t("maximise")}
              title={windowMaximized ? t("restore") : t("maximise")}
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
              {windowMaximized ? "❐" : "□"}
            </button>
            <button
              className="winbtn winbtn--close"
              type="button"
              aria-label={t("close window")}
              title={t("close window")}
              onClick={() => {
                if (!isTauriRuntime()) return;
                void getCurrentWindow().close();
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {searchOpen ? (
          <div className="terminal__search">
            <input
              autoFocus
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                if (value) {
                  runSearch("next", value);
                } else {
                  setSearchMiss(false);
                  xtermRef.current?.clearSearch();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch(event.shiftKey ? "previous" : "next");
                }
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  xtermRef.current?.clearSearch();
                }
              }}
              placeholder={t("find in terminal")}
              aria-label={t("find in terminal")}
              spellCheck={false}
            />
            <button type="button" onClick={() => runSearch("previous")} title={t("previous match")}>
              ↑
            </button>
            <button type="button" onClick={() => runSearch("next")} title={t("next match")}>
              ↓
            </button>
            {searchMiss ? <span>{t("no matches")}</span> : null}
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                xtermRef.current?.clearSearch();
              }}
              title={t("close search")}
            >
              ×
            </button>
          </div>
        ) : null}

        <div
          className={`terminal__screen ${
            hasSession ? "terminal__screen--live" : ""
          }`}
          onClick={focus}
        >
          {hasSession ? (
            <div className="term-xterm">
              <XTermTerminal
                ref={xtermRef}
                theme={terminalTheme}
                fontSize={terminalFontSize}
                onData={handleUserInput}
                onResize={handleTerminalResize}
                onReady={flushPendingWrites}
                onSelectionShortcut={(text) => onSelectionToAi(tabId, text)}
              />
              {ssh.status === "closed" ? (
                <div className="term-xterm__notice">
                  {t("session closed — press connect to open a new link")}
                </div>
              ) : null}
              {ssh.status === "error" ? (
                <div className="term-xterm__notice term-xterm__notice--error">
                  {ssh.error ?? t("session error")}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="term-offline">
              <pre className="term-logo" aria-hidden>
                {LOGO}
              </pre>
              <p className="term-offline__title">{t("NO ACTIVE SSH SESSION")}</p>
              <p className="term-offline__hint">
                {initialTarget
                  ? `${t("restored target {target} — reconnect to resume", { target: `${initialTarget.username}@${initialTarget.host}:${initialTarget.port}` })}`
                  : t("open a connection in this tab, or use another tab/window")}
              </p>
              <button
                className="term-offline__connect"
                type="button"
                onClick={openConnect}
              >
                {t("connect this tab")}
              </button>
            </div>
          )}
        </div>

        <footer className="terminal__foot">
          {hasSession ? (
            <>
              <span>
                <i className="key">^C</i> {t("interrupt")}
              </span>
              <span>
                <i className="key">tab</i> {t("complete")}
              </span>
              <span>
                <i className="key">↑</i> {t("history")}
              </span>
              <span className="term-foot__spacer" />
              <span className="term-foot__hint">
                {t("xterm · ctrl+shift+c/v copy & paste · ctrl+i explain selection")}
              </span>
            </>
          ) : (
            <>
              <span>
                <i className="key">^C</i> {t("interrupt")}
              </span>
              <span>
                <i className="key">↑</i> {t("history")}
              </span>
              <span>
                <i className="key">tab</i> {t("complete")}
              </span>
              <span className="term-foot__spacer" />
              <span className="term-foot__hint">
                {ssh.target?.host
                  ? `${ssh.target.username}@${ssh.target.host} · ${t(ssh.status)}`
                  : t("no session · press connect")}
              </span>
            </>
          )}
        </footer>

        <SshConnectDialog
          open={connectOpen}
          busy={connecting}
          error={connectError}
          initial={ssh.target ?? initialTarget ?? null}
          defaults={defaults}
          hostKeyPrompt={hostKeyPrompt}
          onClose={closeConnect}
          onCancel={cancelConnect}
          onConnect={handleConnect}
        />
      </div>
    );
  }
);
