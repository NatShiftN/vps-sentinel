import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../lib/tauri";
import type { SecurityAudit } from "../lib/security";
import {
  SFTP_MAX_BYTES,
  type SftpChunk,
  type SftpDownload,
  type SftpListing,
} from "../lib/sftp";
import type { LocalForward } from "../lib/forward";

export type SshStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

export type SshAuthMethod = "password" | "key" | "agent";

export type RemoteStats = {
  host: string;
  kernel: string;
  cores: number;
  uptime: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
  load1: number;
  load5: number;
  load15: number;
  cpuPercent: number;
  netRx: number;
  netTx: number;
};

export type JumpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export type SshConfig = {
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  password: string;
  privateKeyPath: string;
  passphrase: string;
  /** Opt-in: retain credentials in memory and retry after a dropped session. */
  autoReconnect: boolean;
  /** Optional password-auth jump host. */
  jump: JumpConfig | null;
};

/** Connection target without secrets, safe to keep in component state. */
export type SshTarget = Pick<
  SshConfig,
  "host" | "port" | "username" | "authMethod" | "privateKeyPath" | "autoReconnect"
>;

export type HostKeyPrompt =
  | {
      kind: "hostKeyUnknown";
      host: string;
      port: number;
      hostKey: string;
    }
  | {
      kind: "hostKeyMismatch";
      host: string;
      port: number;
      hostKey: string;
      stored: string;
    };

export type ConnectResult =
  | { kind: "connected" }
  | { kind: "hostKey"; prompt: HostKeyPrompt }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

type SshOutputPayload = {
  clientId: string;
  sessionId: number;
  data: string;
};

type SshStatusPayload = {
  clientId: string;
  sessionId: number;
  status: "connected" | "closed" | "error";
  message?: string | null;
};

type RemoteMetricsPayload = {
  clientId: string;
  sessionId: number;
  stats: RemoteStats | null;
  error: string | null;
};

const makeClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const readFileBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (file.size > SFTP_MAX_BYTES) {
      reject(
        new Error(
          `File is too large; the SFTP limit is ${
            SFTP_MAX_BYTES / (1024 * 1024)
          } MB.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the local file."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma < 0) {
        reject(new Error("Could not encode the local file."));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });

type ConnectOutcome =
  | { kind: "connected"; sessionId: number; hostKey: string }
  | {
      kind: "hostKeyUnknown";
      host: string;
      port: number;
      hostKey: string;
    }
  | {
      kind: "hostKeyMismatch";
      host: string;
      port: number;
      hostKey: string;
      stored: string;
    };

const CONNECT_CANCELLED = "Connection cancelled.";

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
};

/**
 * Owns the SSH lifecycle and the Tauri event bridge.
 *
 * Backend events:
 *   ssh-output  { sessionId, data }        raw PTY bytes decoded as UTF-8
 *   ssh-status  { sessionId, status, ... }  closed / error
 *
 * Host key verification is mandatory: the backend returns an outcome asking
 * for confirmation before it will send credentials to an unknown host.
 */
export function useSshSession(onOutput: (data: string) => void) {
  const [status, setStatus] = useState<SshStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<SshTarget | null>(null);
  const [hostKey, setHostKey] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [remoteStats, setRemoteStats] = useState<RemoteStats | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const statusRef = useRef<SshStatus>("idle");
  const sessionIdRef = useRef<number | null>(null);
  const clientIdRef = useRef(makeClientId());
  const outputRef = useRef(onOutput);
  const attemptRef = useRef(0);
  const endedEarlyRef = useRef(false);

  const lastConfigRef = useRef<SshConfig | null>(null);
  const autoReconnectRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const hadSessionRef = useRef(false);
  const autoRetryRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const connectRef = useRef<
    | ((
        config: SshConfig,
        trust?: { hostKey: string; replace: boolean }
      ) => Promise<ConnectResult>)
    | null
  >(null);
  const scheduleReconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    outputRef.current = onOutput;
  }, [onOutput]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const cleanup = () => {
      const target = sessionIdRef.current;
      if (target !== null) {
        void invoke("disconnect_ssh", { sessionId: target }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const offOutput = await listen<SshOutputPayload>(
        "ssh-output",
        (event) => {
          if (disposed) return;
          if (event.payload.clientId !== clientIdRef.current) return;
          const current = statusRef.current;
          if (current !== "connecting" && current !== "connected") return;

          const activeId = sessionIdRef.current;
          if (activeId !== null && event.payload.sessionId !== activeId) {
            return;
          }

          outputRef.current(event.payload.data);
        }
      );

      const offRemote = await listen<RemoteMetricsPayload>(
        "remote-metrics",
        (event) => {
          if (disposed) return;
          if (event.payload.clientId !== clientIdRef.current) return;
          const activeId = sessionIdRef.current;
          if (activeId !== null && event.payload.sessionId !== activeId) {
            return;
          }
          setRemoteStats(event.payload.stats);
          setRemoteError(event.payload.error);
        }
      );

      const offStatus = await listen<SshStatusPayload>(
        "ssh-status",
        (event) => {
          if (disposed) return;
          if (event.payload.clientId !== clientIdRef.current) return;

          const { sessionId, status: next, message } = event.payload;
          const activeId = sessionIdRef.current;
          if (activeId !== null && sessionId !== activeId) return;

          const wasConnected = statusRef.current === "connected";

          if (next === "closed") {
            if (statusRef.current === "connecting") endedEarlyRef.current = true;
            sessionIdRef.current = null;
            setRemoteStats(null);
            setRemoteError(message ?? "session ended");
            setStatus("closed");
          } else if (next === "error") {
            if (statusRef.current === "connecting") endedEarlyRef.current = true;
            sessionIdRef.current = null;
            setRemoteStats(null);
            setRemoteError(message ?? "session ended");
            setError(message ?? "SSH session ended with an error.");
            setStatus("error");
          }

          if (
            wasConnected &&
            autoReconnectRef.current &&
            !manualDisconnectRef.current
          ) {
            scheduleReconnectRef.current?.();
          }
        }
      );

      if (disposed) {
        offOutput();
        offRemote();
        offStatus();
        return;
      }
      unlisteners.push(offOutput, offRemote, offStatus);
    };

    void setup().catch((caught) => {
      if (disposed) return;
      console.error("[ssh] failed to subscribe to backend events:", caught);
      setError(toErrorMessage(caught));
      setStatus("error");
    });

    return () => {
      disposed = true;
      unlisteners.forEach((off) => off());
    };
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
    setReconnectAttempt(0);
  }, []);

  const connect = useCallback(
    async (
      config: SshConfig,
      trust?: { hostKey: string; replace: boolean }
    ): Promise<ConnectResult> => {
      if (!isTauriRuntime()) {
        return {
          kind: "error",
          message: "SSH is only available inside the Tauri desktop app.",
        };
      }

      if (!autoRetryRef.current) {
        manualDisconnectRef.current = false;
        clearRetry();
      }

      const attempt = ++attemptRef.current;
      endedEarlyRef.current = false;
      setError(null);
      setRemoteStats(null);
      setRemoteError(null);
      setStatus("connecting");
      const previousSessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      const host = config.host.trim();
      const username = config.username.trim();

      try {
        const outcome = await invoke<ConnectOutcome>("connect_ssh", {
          clientId: clientIdRef.current,
          host,
          port: config.port,
          username,
          authMethod: config.authMethod,
          password:
            config.authMethod === "password" ? config.password : null,
          privateKeyPath:
            config.authMethod === "key" ? config.privateKeyPath.trim() : null,
          passphrase:
            config.authMethod === "key" ? config.passphrase : null,
          trustFingerprint: trust?.hostKey ?? null,
          replaceHostKey: trust?.replace ?? false,
          jump: config.jump,
        });

        if (attempt !== attemptRef.current) {
          return { kind: "cancelled" };
        }

        if (outcome.kind === "hostKeyUnknown") {
          setStatus("idle");
          return {
            kind: "hostKey",
            prompt: {
              kind: "hostKeyUnknown",
              host: outcome.host,
              port: outcome.port,
              hostKey: outcome.hostKey,
            },
          };
        }

        if (outcome.kind === "hostKeyMismatch") {
          setStatus("idle");
          return {
            kind: "hostKey",
            prompt: {
              kind: "hostKeyMismatch",
              host: outcome.host,
              port: outcome.port,
              hostKey: outcome.hostKey,
              stored: outcome.stored,
            },
          };
        }

        sessionIdRef.current = outcome.sessionId;
        if (
          previousSessionId !== null &&
          previousSessionId !== outcome.sessionId
        ) {
          void invoke("disconnect_ssh", {
            sessionId: previousSessionId,
          }).catch(() => {});
        }
        setHostKey(outcome.hostKey);
        setTarget({
          host,
          port: config.port,
          username,
          authMethod: config.authMethod,
          privateKeyPath:
            config.authMethod === "key" ? config.privateKeyPath.trim() : "",
          autoReconnect: config.autoReconnect,
        });

        hadSessionRef.current = true;
        autoReconnectRef.current = config.autoReconnect;
        manualDisconnectRef.current = false;
        lastConfigRef.current = config.autoReconnect ? config : null;
        retryAttemptRef.current = 0;
        setReconnectAttempt(0);

        if (endedEarlyRef.current) {
          sessionIdRef.current = null;
          setStatus("closed");
        } else {
          setStatus("connected");
        }

        return { kind: "connected" };
      } catch (caught) {
        if (attempt !== attemptRef.current) {
          return { kind: "cancelled" };
        }

        const message = toErrorMessage(caught);
        if (message === CONNECT_CANCELLED) {
          setStatus("idle");
          return { kind: "cancelled" };
        }

        setError(message);
        setStatus("error");
        return { kind: "error", message };
      }
    },
    [clearRetry]
  );

  /**
   * Opt-in auto-reconnect after an established session is lost.
   * Retries at 1s / 2s / 4s (max 3), never auto-trusts a changed host key,
   * and stops on authentication failures to avoid account lockout.
   */
  const scheduleReconnect = useCallback(() => {
    if (retryTimerRef.current !== null) return;

    const config = lastConfigRef.current;
    if (!config || !autoReconnectRef.current || manualDisconnectRef.current) {
      return;
    }

    if (retryAttemptRef.current >= 3) {
      setError("Auto-reconnect stopped after 3 attempts.");
      setReconnectAttempt(0);
      return;
    }

    const attempt = retryAttemptRef.current + 1;
    retryAttemptRef.current = attempt;
    const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
    setReconnectAttempt(attempt);
    outputRef.current(
      `\r\n[ssh] link lost — reconnecting in ${delay / 1000}s (attempt ${attempt}/3)\r\n`
    );

    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;

      const current = lastConfigRef.current;
      if (!current || manualDisconnectRef.current || !autoReconnectRef.current) {
        return;
      }

      autoRetryRef.current = true;
      void connectRef
        .current?.(current)
        .then((result) => {
          autoRetryRef.current = false;

          if (result.kind === "connected") {
            retryAttemptRef.current = 0;
            setReconnectAttempt(0);
            outputRef.current("\r\n[ssh] reconnected\r\n");
            return;
          }

          if (result.kind === "hostKey") {
            autoReconnectRef.current = false;
            lastConfigRef.current = null;
            setReconnectAttempt(0);
            setError(
              "Host key changed during auto-reconnect. Connect manually to review the fingerprint."
            );
            setStatus("error");
            return;
          }

          if (result.kind === "cancelled") {
            setReconnectAttempt(0);
            return;
          }

          const message = result.message.toLowerCase();
          if (
            message.includes("authentication") ||
            message.includes("host key") ||
            message.includes("rejected")
          ) {
            autoReconnectRef.current = false;
            lastConfigRef.current = null;
            setReconnectAttempt(0);
            return;
          }

          if (retryAttemptRef.current < 3) {
            scheduleReconnectRef.current?.();
          } else {
            setReconnectAttempt(0);
          }
        })
        .catch((caught) => {
          autoRetryRef.current = false;
          setError(toErrorMessage(caught));
          setReconnectAttempt(0);
        });
    }, delay);
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      // A tab can disappear while a session is still open or while an
      // auto-reconnect is in flight. Clean up both so no orphan SSH channel
      // survives the component.
      const target = sessionIdRef.current;
      if (target !== null) {
        void invoke("disconnect_ssh", { sessionId: target }).catch(() => {});
      }
      void invoke("cancel_connect", {
        clientId: clientIdRef.current,
      }).catch(() => {});
    },
    []
  );

  const cancel = useCallback(async () => {
    // Invalidate the pending promise so its outcome cannot overwrite state.
    attemptRef.current += 1;
    endedEarlyRef.current = false;
    clearRetry();
    setStatus("idle");
    setError(null);

    if (!isTauriRuntime()) return;

    try {
      await invoke("cancel_connect", {
        clientId: clientIdRef.current,
      });
    } catch (caught) {
      console.warn("[ssh] cancel_connect failed:", toErrorMessage(caught));
    }
  }, []);

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true;
    autoReconnectRef.current = false;
    hadSessionRef.current = false;
    lastConfigRef.current = null;
    clearRetry();
    const target = sessionIdRef.current;

    try {
      await invoke("disconnect_ssh", { sessionId: target });
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      sessionIdRef.current = null;
      setRemoteStats(null);
      setRemoteError(null);
      setStatus("closed");
    }
  }, [clearRetry]);

  /** Sends raw keystrokes (including control characters) to the remote shell. */
  const handleUserInput = useCallback(async (data: string) => {
    if (statusRef.current !== "connected" || !data) return;

    try {
      await invoke("send_ssh_input", {
        data,
        sessionId: sessionIdRef.current,
      });
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }, []);

  /** AI insertion path: uses the write_ssh alias requested by the AI feature. */
  const writePty = useCallback(async (data: string) => {
    if (statusRef.current !== "connected" || !data) return;

    try {
      await invoke("write_ssh", {
        data,
        sessionId: sessionIdRef.current,
      });
    } catch (caught) {
      setError(toErrorMessage(caught));
    }
  }, []);

  /** Keeps the remote PTY in sync with the xterm viewport. */
  const resize = useCallback(async (cols: number, rows: number) => {
    if (statusRef.current !== "connected") return;

    try {
      await invoke("resize_ssh", {
        cols,
        rows,
        sessionId: sessionIdRef.current,
      });
    } catch (caught) {
      console.warn("[ssh] resize failed:", toErrorMessage(caught));
    }
  }, []);

  const runSecurityAudit = useCallback(async () => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<SecurityAudit>("run_security_audit", {
      sessionId: sessionIdRef.current,
    });
  }, []);

  const sftpList = useCallback(async (path: string) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<SftpListing>("sftp_list", {
      sessionId: sessionIdRef.current,
      path,
    });
  }, []);

  const sftpDownload = useCallback(async (path: string) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<SftpDownload>("sftp_download", {
      sessionId: sessionIdRef.current,
      path,
    });
  }, []);

  const sftpUpload = useCallback(async (path: string, file: File) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    const data = await readFileBase64(file);
    return invoke<number>("sftp_upload", {
      sessionId: sessionIdRef.current,
      path,
      dataBase64: data,
    });
  }, []);

  const sftpDelete = useCallback(async (path: string, isDir: boolean) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<void>("sftp_delete", {
      sessionId: sessionIdRef.current,
      path,
      isDir,
    });
  }, []);

  const sftpRename = useCallback(async (from: string, to: string) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<void>("sftp_rename", {
      sessionId: sessionIdRef.current,
      from,
      to,
    });
  }, []);

  const sftpMkdir = useCallback(async (path: string) => {
    if (statusRef.current !== "connected" || sessionIdRef.current === null) {
      throw new Error("SSH session is not connected.");
    }
    return invoke<void>("sftp_mkdir", {
      sessionId: sessionIdRef.current,
      path,
    });
  }, []);

  const sftpDownloadChunk = useCallback(
    async (path: string, offset: number, length: number) => {
      if (statusRef.current !== "connected" || sessionIdRef.current === null) {
        throw new Error("SSH session is not connected.");
      }
      return invoke<SftpChunk>("sftp_download_chunk", {
        sessionId: sessionIdRef.current,
        path,
        offset,
        length,
      });
    },
    []
  );

  const sftpUploadChunk = useCallback(
    async (
      path: string,
      offset: number,
      dataBase64: string,
      truncate: boolean
    ) => {
      if (statusRef.current !== "connected" || sessionIdRef.current === null) {
        throw new Error("SSH session is not connected.");
      }
      return invoke<number>("sftp_upload_chunk", {
        sessionId: sessionIdRef.current,
        path,
        offset,
        dataBase64,
        truncate,
      });
    },
    []
  );

  const startLocalForward = useCallback(
    async (bindPort: number, destHost: string, destPort: number) => {
      if (statusRef.current !== "connected" || sessionIdRef.current === null) {
        throw new Error("SSH session is not connected.");
      }
      return invoke<LocalForward>("start_local_forward", {
        sessionId: sessionIdRef.current,
        bindPort,
        destHost,
        destPort,
      });
    },
    []
  );

  const listLocalForwards = useCallback(async () => {
    return invoke<LocalForward[]>("list_local_forwards");
  }, []);

  const stopLocalForward = useCallback(async (id: number) => {
    return invoke<void>("stop_local_forward", { id });
  }, []);

  return {
    status,
    error,
    target,
    hostKey,
    reconnectAttempt,
    remoteStats,
    remoteError,
    connect,
    cancel,
    disconnect,
    handleUserInput,
    writePty,
    resize,
    runSecurityAudit,
    sftpList,
    sftpDownload,
    sftpUpload,
    sftpDelete,
    sftpRename,
    sftpMkdir,
    sftpDownloadChunk,
    sftpUploadChunk,
    startLocalForward,
    listLocalForwards,
    stopLocalForward,
  };
}
