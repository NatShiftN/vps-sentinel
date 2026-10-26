import { useCallback, useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { XTermTerminal, type XTermHandle, type XTermTheme } from "./XTermTerminal";
import type { OpenSshConfig, OpenSshSessionInfo } from "../lib/openssh";
import { isTauriRuntime } from "../lib/tauri";
import { useI18n } from "../lib/i18n";

type OutputPayload = {
  clientId: string;
  sessionId: number;
  data: string;
};

type StatusPayload = {
  clientId: string;
  sessionId: number;
  status: "connected" | "closed" | "error";
  message?: string | null;
};

type Props = {
  config: OpenSshConfig;
  theme: XTermTheme;
  fontSize: number;
  active: boolean;
  onClose: () => void;
};

export function OpenSshPane({ config, theme, fontSize, active, onClose }: Props) {
  const { t } = useI18n();
  const termRef = useRef<XTermHandle>(null);
  const sessionRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const clientIdRef = useRef(
    `openssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [status, setStatus] = useState<"starting" | "connected" | "closed" | "error">(
    "starting"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientIdRef.current = `openssh-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    sessionRef.current = null;
    startedRef.current = false;
    setStatus("starting");
    setError(null);
    if (!isTauriRuntime()) {
      setError("OpenSSH sessions require the Tauri desktop app.");
      setStatus("error");
      return;
    }

    let unlistenOutput: UnlistenFn | undefined;
    let unlistenStatus: UnlistenFn | undefined;
    let cancelled = false;
    void Promise.all([
      listen<OutputPayload>("ssh-output", (event) => {
        const payload = event.payload;
        if (payload.clientId !== clientIdRef.current) return;
        termRef.current?.write(payload.data);
      }),
      listen<StatusPayload>("ssh-status", (event) => {
        const payload = event.payload;
        if (payload.clientId !== clientIdRef.current) return;
        if (payload.status === "connected") {
          setStatus("connected");
        } else if (payload.status === "closed") {
          setStatus("closed");
        } else {
          setStatus("error");
          setError(payload.message ?? "OpenSSH session failed.");
        }
      }),
    ]).then(([output, statusListener]) => {
      if (cancelled) {
        output();
        statusListener();
        return;
      }
      unlistenOutput = output;
      unlistenStatus = statusListener;
    });

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenStatus?.();
      if (sessionRef.current !== null) {
        void invoke("stop_openssh_session", {
          sessionId: sessionRef.current,
        }).catch(() => undefined);
        sessionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current || !isTauriRuntime()) return;
    startedRef.current = true;
    try {
      const info = await invoke<OpenSshSessionInfo>("start_openssh_session", {
        request: {
          clientId: clientIdRef.current,
          host: config.host,
          port: config.port,
          username: config.username,
          privateKeyPath: config.privateKeyPath,
          x11: config.x11,
          agent: config.agent,
          cols: 110,
          rows: 32,
        },
      });
      sessionRef.current = info.sessionId;
    } catch (caught) {
      setError(String(caught));
      setStatus("error");
    }
  }, [config]);

  useEffect(() => {
    if (active) {
      window.setTimeout(() => termRef.current?.focus(), 80);
    }
  }, [active]);

  return (
    <div className="openssh-pane">
      <header className="openssh-pane__head">
        <div>
          <b>OPENSSH · {config.username}@{config.host}:{config.port}</b>
          <span>
            {config.x11 ? "X11" : ""}
            {config.x11 && config.agent ? " · " : ""}
            {config.agent ? "AGENT" : ""} · {status}
          </span>
        </div>
        <div className="openssh-pane__actions">
          <span className={`openssh-dot is-${status}`} aria-hidden />
          <button type="button" onClick={onClose} title={t("close tab")}>
            ×
          </button>
        </div>
      </header>
      {error ? <p className="openssh-error">{error}</p> : null}
      <div className="openssh-pane__term">
        <XTermTerminal
          ref={termRef}
          theme={theme}
          fontSize={fontSize}
          onData={(data) => {
            const sessionId = sessionRef.current;
            if (sessionId !== null) {
              void invoke("send_openssh_input", { sessionId, data }).catch(
                (caught) => setError(String(caught))
              );
            }
          }}
          onResize={(cols, rows) => {
            const sessionId = sessionRef.current;
            if (sessionId !== null) {
              void invoke("resize_openssh", { sessionId, cols, rows }).catch(
                () => undefined
              );
            }
          }}
          onReady={() => void start()}
        />
      </div>
      <footer className="openssh-pane__foot">
        <span>
          {t("system OpenSSH · X11/agent forwarding · host key handled by ssh")}
        </span>
        <span>{config.privateKeyPath || "ssh-agent / password prompt"}</span>
      </footer>
    </div>
  );
}
