import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  HostKeyPrompt,
  SshAuthMethod,
  SshConfig,
  SshTarget,
} from "../hooks/useSshSession";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  initial?: SshTarget | null;
  defaults?: {
    port: number;
    username: string;
    autoReconnect: boolean;
  } | null;
  hostKeyPrompt?: HostKeyPrompt | null;
  onClose: () => void;
  onCancel: () => void;
  onConnect: (
    config: SshConfig,
    trust?: { hostKey: string; replace: boolean }
  ) => void;
};

/**
 * Connection dialog for password, private-key, or ssh-agent auth.
 * Host keys are confirmed explicitly before any credential is sent.
 */
export function SshConnectDialog({
  open,
  busy,
  error,
  initial,
  defaults,
  hostKeyPrompt,
  onClose,
  onCancel,
  onConnect,
}: Props) {
  const [host, setHost] = useState(initial?.host ?? "127.0.0.1");
  const [port, setPort] = useState(
    String(initial?.port ?? defaults?.port ?? 22)
  );
  const [username, setUsername] = useState(
    initial?.username ?? defaults?.username ?? "root"
  );
  const [authMethod, setAuthMethod] = useState<SshAuthMethod>(
    initial?.authMethod ?? "password"
  );
  const [password, setPassword] = useState("");
  const [privateKeyPath, setPrivateKeyPath] = useState(
    initial?.privateKeyPath || "~/.ssh/id_ed25519"
  );
  const [passphrase, setPassphrase] = useState("");
  const [autoReconnect, setAutoReconnect] = useState(
    initial?.autoReconnect ?? defaults?.autoReconnect ?? true
  );
  const [jumpEnabled, setJumpEnabled] = useState(false);
  const [jumpHost, setJumpHost] = useState("");
  const [jumpPort, setJumpPort] = useState("22");
  const [jumpUsername, setJumpUsername] = useState("root");
  const [jumpPassword, setJumpPassword] = useState("");
  const { t } = useI18n();
  const [localError, setLocalError] = useState<string | null>(null);

  const hostRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;

    setHost(initial?.host ?? "127.0.0.1");
    setPort(String(initial?.port ?? defaults?.port ?? 22));
    setUsername(initial?.username ?? defaults?.username ?? "root");
    setAuthMethod(initial?.authMethod ?? "password");
    setPassword("");
    setPrivateKeyPath(initial?.privateKeyPath || "~/.ssh/id_ed25519");
    setPassphrase("");
    setAutoReconnect(
      initial?.autoReconnect ?? defaults?.autoReconnect ?? true
    );
    setJumpEnabled(false);
    setJumpHost("");
    setJumpPort("22");
    setJumpUsername("root");
    setJumpPassword("");
    setLocalError(null);

    const timer = window.setTimeout(() => hostRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busy) {
          onCancel();
        } else {
          onClose();
        }
        return;
      }

      // Keep keyboard focus inside the dialog.
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, onCancel]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const parsedPort = Number(port);

    if (!host.trim()) {
      setLocalError("Host is required.");
      return;
    }
    if (!username.trim()) {
      setLocalError("Username is required.");
      return;
    }
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setLocalError("Port must be an integer between 1 and 65535.");
      return;
    }
    if (authMethod === "password" && !password) {
      setLocalError("Password is required for password authentication.");
      return;
    }
    if (authMethod === "key" && !privateKeyPath.trim()) {
      setLocalError("Private key path is required.");
      return;
    }
    // For ssh-agent, the local agent owns the key; no extra secret is needed.

    const parsedJumpPort = Number(jumpPort);
    if (jumpEnabled) {
      if (!jumpHost.trim() || !jumpUsername.trim()) {
        setLocalError("Jump host and jump username are required.");
        return;
      }
      if (
        !Number.isInteger(parsedJumpPort) ||
        parsedJumpPort < 1 ||
        parsedJumpPort > 65535
      ) {
        setLocalError("Jump port must be an integer between 1 and 65535.");
        return;
      }
      if (!jumpPassword) {
        setLocalError("Jump password is required (password auth only).");
        return;
      }
    }

    setLocalError(null);

    const config: SshConfig = {
      host: host.trim(),
      port: parsedPort,
      username: username.trim(),
      authMethod,
      password: authMethod === "password" ? password : "",
      privateKeyPath:
        authMethod === "key" ? privateKeyPath.trim() : "",
      passphrase: authMethod === "key" ? passphrase : "",
      autoReconnect,
      jump: jumpEnabled
        ? {
            host: jumpHost.trim(),
            port: parsedJumpPort,
            username: jumpUsername.trim(),
            password: jumpPassword,
          }
        : null,
    };

    if (hostKeyPrompt) {
      onConnect(config, {
        hostKey: hostKeyPrompt.hostKey,
        replace: hostKeyPrompt.kind === "hostKeyMismatch",
      });
    } else {
      onConnect(config);
    }
  };

  const message = localError ?? error;
  const primaryLabel = busy
    ? t("connecting…")
    : hostKeyPrompt
      ? hostKeyPrompt.kind === "hostKeyMismatch"
        ? t("replace key & connect")
        : t("trust & connect")
      : t("connect");

  return (
    <div className="ssh-modal">
      <div
        className="ssh-modal__backdrop"
        onMouseDown={() => {
          if (busy) onCancel();
          else onClose();
        }}
      />

      <form
        ref={panelRef}
        className="ssh-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssh-modal-title"
        onSubmit={submit}
      >
        <i className="corner corner--tl" aria-hidden />
        <i className="corner corner--tr" aria-hidden />
        <i className="corner corner--bl" aria-hidden />
        <i className="corner corner--br" aria-hidden />

        <header className="ssh-modal__head">
          <div>
            <p className="ssh-modal__kicker">{t("secure shell · outbound")}</p>
            <h2 className="ssh-modal__title" id="ssh-modal-title">
              {t("ESTABLISH LINK")}
            </h2>
          </div>
          <button
            className="winbtn winbtn--close"
            type="button"
            aria-label={t("close dialog")}
            onClick={busy ? onCancel : onClose}
          >
            ✕
          </button>
        </header>

        <p className="ssh-modal__hint">
          {t("host key verification · pty xterm-256color · auto resize")}
        </p>

        <div className="ssh-authmodes" role="radiogroup" aria-label={t("authentication method")}>
          <button
            className={authMethod === "password" ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={authMethod === "password"}
            onClick={() => setAuthMethod("password")}
            disabled={busy}
          >
            {t("password")}
          </button>
          <button
            className={authMethod === "key" ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={authMethod === "key"}
            onClick={() => setAuthMethod("key")}
            disabled={busy}
          >
            {t("private key")}
          </button>
          <button
            className={authMethod === "agent" ? "is-active" : ""}
            type="button"
            role="radio"
            aria-checked={authMethod === "agent"}
            onClick={() => setAuthMethod("agent")}
            disabled={busy}
          >
            ssh-agent
          </button>
        </div>

        <div className="ssh-modal__grid">
          <label className="ssh-field ssh-field--wide">
            <span>{t("host")}</span>
            <input
              ref={hostRef}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="203.0.113.42"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>

          <label className="ssh-field">
            <span>{t("username")}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="root"
              autoComplete="username"
              spellCheck={false}
              disabled={busy}
            />
          </label>

          <label className="ssh-field ssh-field--port">
            <span>{t("port")}</span>
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              inputMode="numeric"
              placeholder="22"
              disabled={busy}
            />
          </label>

          {authMethod === "password" ? (
            <label className="ssh-field ssh-field--wide">
              <span>{t("password")}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </label>
          ) : authMethod === "key" ? (
            <>
              <label className="ssh-field ssh-field--wide">
                <span>{t("private key")}</span>
                <input
                  value={privateKeyPath}
                  onChange={(event) => setPrivateKeyPath(event.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>

              <label className="ssh-field ssh-field--wide">
                <span>{t("key passphrase (optional)")}</span>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
            </>
          ) : (
            <p className="ssh-agent-note">
              {t("Use the current user's ssh-agent (SSH_AUTH_SOCK / Windows OpenSSH Authentication Agent). Private key files are not read.")}
            </p>
          )}
        </div>

        <label className="ssh-check">
          <input
            type="checkbox"
            checked={jumpEnabled}
            onChange={(event) => setJumpEnabled(event.target.checked)}
            disabled={busy}
          />
          <span>
            {t("connect through jump host (password auth · jump key must already be trusted)")}
          </span>
        </label>

        {jumpEnabled ? (
          <div className="ssh-modal__grid ssh-jump">
            <label className="ssh-field ssh-field--wide">
              <span>{t("jump host")}</span>
              <input
                value={jumpHost}
                onChange={(event) => setJumpHost(event.target.value)}
                placeholder="10.0.0.5"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <label className="ssh-field">
              <span>{t("jump user")}</span>
              <input
                value={jumpUsername}
                onChange={(event) => setJumpUsername(event.target.value)}
                autoComplete="username"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <label className="ssh-field ssh-field--port">
              <span>{t("jump port")}</span>
              <input
                value={jumpPort}
                onChange={(event) => setJumpPort(event.target.value)}
                inputMode="numeric"
                placeholder="22"
                disabled={busy}
              />
            </label>
            <label className="ssh-field ssh-field--wide">
              <span>{t("jump password")}</span>
              <input
                type="password"
                value={jumpPassword}
                onChange={(event) => setJumpPassword(event.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </label>
          </div>
        ) : null}

        <label className="ssh-check">
          <input
            type="checkbox"
            checked={autoReconnect}
            onChange={(event) => setAutoReconnect(event.target.checked)}
            disabled={busy}
          />
          <span>
            {t("auto-reconnect with backoff (3 tries · keeps credentials in memory)")}
          </span>
        </label>

        {hostKeyPrompt ? (
          <div
            className={`ssh-hostkey ${
              hostKeyPrompt.kind === "hostKeyMismatch" ? "is-mismatch" : ""
            }`}
            role="alert"
          >
            <p className="ssh-hostkey__title">
              {hostKeyPrompt.kind === "hostKeyMismatch"
                ? t("host key changed")
                : t("unknown host key")}
            </p>
            <code className="ssh-hostkey__fp">{hostKeyPrompt.hostKey}</code>
            {hostKeyPrompt.kind === "hostKeyMismatch" ? (
              <p className="ssh-hostkey__stored">
                {t("stored")}: <code>{hostKeyPrompt.stored}</code>
              </p>
            ) : null}
            <p className="ssh-hostkey__note">
              {t("compare this fingerprint with the server operator out of band before trusting it.")}
            </p>
          </div>
        ) : null}

        {message ? (
          <p className="ssh-modal__error" role="alert">
            <span aria-hidden>!</span> {message}
          </p>
        ) : null}

        <footer className="ssh-modal__foot">
          <span className="ssh-modal__warn">
            {t("keys are pinned in the app config directory")}
          </span>

          <div className="ssh-modal__actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={busy ? onCancel : onClose}
            >
              {busy ? t("cancel") : t("close")}
            </button>
            <button className="btn-primary" type="submit" disabled={busy}>
              {primaryLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
