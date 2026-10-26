import { useCallback, useEffect, useState } from "react";
import type { LocalForward, RemoteForward } from "../lib/forward";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  canForward: boolean;
  onClose: () => void;
  start: (
    bindPort: number,
    destHost: string,
    destPort: number
  ) => Promise<LocalForward>;
  list: () => Promise<LocalForward[]>;
  stop: (id: number) => Promise<void>;
  startRemote: (
    remoteHost: string,
    remotePort: number,
    localHost: string,
    localPort: number
  ) => Promise<RemoteForward>;
  listRemote: () => Promise<RemoteForward[]>;
  stopRemote: (id: number) => Promise<void>;
};

export function ForwardPanel({
  open,
  canForward,
  onClose,
  start,
  list,
  stop,
  startRemote,
  listRemote,
  stopRemote,
}: Props) {
  const { t } = useI18n();
  const [forwards, setForwards] = useState<LocalForward[]>([]);
  const [remoteForwards, setRemoteForwards] = useState<RemoteForward[]>([]);
  const [mode, setMode] = useState<"local" | "remote">("local");
  const [bindPort, setBindPort] = useState("0");
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState("8080");
  const [localHost, setLocalHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState("80");
  const [destHost, setDestHost] = useState("127.0.0.1");
  const [destPort, setDestPort] = useState("80");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [localForwards, remote] = await Promise.all([list(), listRemote()]);
      setForwards(localForwards);
      setRemoteForwards(remote);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }, [list]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleStart = async () => {
    const local = Number(bindPort);
    const remote = Number(destPort);
    if (!Number.isInteger(local) || local < 0 || local > 65535) {
      setError("Local port must be 0-65535 (0 = automatic).");
      return;
    }
    if (!destHost.trim()) {
      setError("Destination host is required.");
      return;
    }
    if (!Number.isInteger(remote) || remote < 1 || remote > 65535) {
      setError("Destination port must be 1-65535.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "remote") {
        const rPort = Number(remotePort);
        const lPort = Number(localPort);
        if (!Number.isInteger(rPort) || rPort < 1 || rPort > 65535) {
          throw new Error(t("Remote listen port must be 1-65535."));
        }
        if (!Number.isInteger(lPort) || lPort < 1 || lPort > 65535) {
          throw new Error(t("Local destination port must be 1-65535."));
        }
        if (!remoteHost.trim() || !localHost.trim()) {
          throw new Error(t("Remote and local hosts are required."));
        }
        const created = await startRemote(
          remoteHost.trim(),
          rPort,
          localHost.trim(),
          lPort
        );
        setStatus(
          t("remote {bind} → local {dest}", {
            bind: `${created.remoteHost}:${created.remotePort}`,
            dest: `${created.localHost}:${created.localPort}`,
          })
        );
      } else {
        const created = await start(local, destHost.trim(), remote);
        setStatus(
          t("listening {bind} → {dest}", {
            bind: created.bindAddr,
            dest: `${created.destHost}:${created.destPort}`,
          })
        );
      }
      await load();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (forward: LocalForward) => {
    setBusy(true);
    setError(null);
    try {
      await stop(forward.id);
      setStatus(t("stopped {bind}", { bind: forward.bindAddr }));
      await load();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleStopRemote = async (forward: RemoteForward) => {
    setBusy(true);
    setError(null);
    try {
      await stopRemote(forward.id);
      setStatus(
        t("stopped remote {bind}", {
          bind: `${forward.remoteHost}:${forward.remotePort}`,
        })
      );
      await load();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ai-drawer forward-drawer" aria-label={t("Local port forwarding")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ⇄
          </span>
          <div>
            <h2>{t("PORT FORWARD")}</h2>
            <p>{t("local 127.0.0.1 · active tab · MVP")}</p>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className="ai-iconbtn"
            type="button"
            onClick={() => void load()}
            disabled={busy}
            title={t("refresh")}
            aria-label={t("refresh")}
          >
            ↻
          </button>
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

      <div className="ai-drawer__body forward-body">
        {!canForward ? (
          <p className="sec-empty">{t("Connect SSH before creating a local forward.")}</p>
        ) : (
          <>
            <div className="forward-mode">
              <button
                type="button"
                className={mode === "local" ? "is-active" : ""}
                onClick={() => setMode("local")}
              >
                {t("local forward")}
              </button>
              <button
                type="button"
                className={mode === "remote" ? "is-active" : ""}
                onClick={() => setMode("remote")}
              >
                {t("remote forward")}
              </button>
            </div>

            <div className="forward-form">
              {mode === "local" ? (
                <>
                  <label className="forward-field">
                    <span>{t("local port")}</span>
                    <input
                      value={bindPort}
                      onChange={(event) => setBindPort(event.target.value)}
                      inputMode="numeric"
                      title={t("0 = choose a free port")}
                    />
                  </label>
                  <label className="forward-field forward-field--host">
                    <span>{t("destination host")}</span>
                    <input
                      value={destHost}
                      onChange={(event) => setDestHost(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label className="forward-field">
                    <span>{t("destination port")}</span>
                    <input
                      value={destPort}
                      onChange={(event) => setDestPort(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="forward-field">
                    <span>{t("remote bind host")}</span>
                    <input
                      value={remoteHost}
                      onChange={(event) => setRemoteHost(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label className="forward-field">
                    <span>{t("remote port")}</span>
                    <input
                      value={remotePort}
                      onChange={(event) => setRemotePort(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="forward-field">
                    <span>{t("local dest host")}</span>
                    <input
                      value={localHost}
                      onChange={(event) => setLocalHost(event.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label className="forward-field">
                    <span>{t("local dest port")}</span>
                    <input
                      value={localPort}
                      onChange={(event) => setLocalPort(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                </>
              )}
              <button
                className="forward-start"
                type="button"
                onClick={() => void handleStart()}
                disabled={busy}
              >
                {t("start")}
              </button>
            </div>

            <p className="forward-hint">
              {mode === "local"
                ? t("Each local connection opens a separate authenticated SSH transport and a direct-tcpip channel.")
                : t("The remote server listens and forwards each connection to a local TCP destination through this SSH session.")}
            </p>

            {error ? <p className="sec-error">{error}</p> : null}
            {status ? <p className="sftp-status">{status}</p> : null}
            {busy ? <p className="sftp-status">{t("working…")}</p> : null}

            <div className="forward-list">
              {forwards.length === 0 ? (
                <p className="sec-empty">{t("no active forwards")}</p>
              ) : (
                forwards.map((forward) => (
                  <div className="forward-row" key={forward.id}>
                    <div className="forward-row__path">
                      <span className="forward-row__bind">
                        {forward.bindAddr}
                      </span>
                      <span className="forward-row__arrow">→</span>
                      <span>
                        {forward.destHost}:{forward.destPort}
                      </span>
                    </div>
                    <button
                      className="forward-stop"
                      type="button"
                      onClick={() => void handleStop(forward)}
                      disabled={busy}
                    >
                      {t("stop")}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="forward-list">
              {remoteForwards.length === 0 ? null : (
                remoteForwards.map((forward) => (
                  <div className="forward-row" key={`r-${forward.id}`}>
                    <div className="forward-row__path">
                      <span className="forward-row__bind">
                        {forward.remoteHost}:{forward.remotePort}
                      </span>
                      <span className="forward-row__arrow">→</span>
                      <span>
                        {forward.localHost}:{forward.localPort}
                      </span>
                    </div>
                    <button
                      className="forward-stop"
                      type="button"
                      onClick={() => void handleStopRemote(forward)}
                      disabled={busy}
                    >
                      {t("stop")}
                    </button>
                  </div>
                ))
              )}
            </div>

            <p className="forward-foot">
              {t("session #{id} · rules stop when the tab disconnects", { id: forwards[0]?.sessionId ?? "—" })}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
