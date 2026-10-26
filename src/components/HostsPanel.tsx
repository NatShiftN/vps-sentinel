import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SshAuthMethod, SshTarget } from "../hooks/useSshSession";
import {
  makeHostId,
  type HostProfile,
  type SshConfigHost,
} from "../lib/hosts";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  hosts: HostProfile[];
  onSave: (host: HostProfile) => void;
  onRemove: (id: string) => void;
  onConnect: (host: HostProfile) => void;
  onConnectExternal: (
    host: HostProfile,
    options: { x11: boolean; agent: boolean }
  ) => void;
  onImport: (hosts: HostProfile[]) => void;
  currentTarget: SshTarget | null;
  defaults: { port: number; username: string; autoReconnect: boolean };
};

type Draft = {
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath: string;
  group: string;
  autoReconnect: boolean;
};

const emptyDraft = (defaults: Props["defaults"]): Draft => ({
  name: "",
  host: "",
  port: String(defaults.port || 22),
  username: defaults.username || "root",
  authMethod: "password",
  privateKeyPath: "",
  group: "",
  autoReconnect: defaults.autoReconnect,
});

export function HostsPanel({
  open,
  onClose,
  hosts,
  onSave,
  onRemove,
  onConnect,
  onConnectExternal,
  onImport,
  currentTarget,
  defaults,
}: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaults));
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [x11, setX11] = useState(true);
  const [agent, setAgent] = useState(true);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return hosts;
    return hosts.filter((host) =>
      [host.name, host.host, host.username, host.group]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [hosts, search]);

  if (!open) return null;

  const update = (patch: Partial<Draft>) =>
    setDraft((previous) => ({ ...previous, ...patch }));

  const startNew = () => {
    setEditing(null);
    setDraft(emptyDraft(defaults));
    setError(null);
  };

  const useCurrent = () => {
    if (!currentTarget) return;
    setEditing(null);
    setDraft({
      name: `${currentTarget.username}@${currentTarget.host}`,
      host: currentTarget.host,
      port: String(currentTarget.port),
      username: currentTarget.username,
      authMethod: currentTarget.authMethod,
      privateKeyPath: currentTarget.privateKeyPath,
      group: "",
      autoReconnect: currentTarget.autoReconnect,
    });
  };

  const edit = (host: HostProfile) => {
    setEditing(host.id);
    setDraft({
      name: host.name,
      host: host.host,
      port: String(host.port),
      username: host.username,
      authMethod: host.authMethod,
      privateKeyPath: host.privateKeyPath,
      group: host.group,
      autoReconnect: host.autoReconnect,
    });
  };

  const importConfig = async () => {
    setError(null);
    try {
      const imported = await invoke<SshConfigHost[]>("import_ssh_config", {});
      if (imported.length === 0) {
        setError(t("No Host entries found in ~/.ssh/config."));
        return;
      }
      const profiles = imported.map((host) => ({
        id: makeHostId(),
        name: host.name,
        host: host.host,
        port: host.port,
        username: host.username,
        authMethod: host.identityFile ? ("key" as const) : ("agent" as const),
        privateKeyPath: host.identityFile,
        group: "ssh config",
        autoReconnect: true,
      }));
      onImport(profiles);
      setError(
        imported.some((host) => host.proxyJump)
          ? t("Imported {count} hosts; ProxyJump entries need manual setup.", {
              count: profiles.length,
            })
          : null
      );
    } catch (caught) {
      setError(String(caught));
    }
  };

  const submit = () => {
    const port = Number(draft.port);
    if (!draft.host.trim()) {
      setError(t("Host is required."));
      return;
    }
    if (!draft.username.trim()) {
      setError(t("Username is required."));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError(t("Port must be 1-65535."));
      return;
    }
    if (draft.authMethod === "key" && !draft.privateKeyPath.trim()) {
      setError(t("Private key path is required for key auth."));
      return;
    }
    const profile: HostProfile = {
      id: editing ?? makeHostId(),
      name: draft.name.trim() || draft.host.trim(),
      host: draft.host.trim(),
      port,
      username: draft.username.trim(),
      authMethod: draft.authMethod,
      privateKeyPath: draft.privateKeyPath.trim(),
      group: draft.group.trim(),
      autoReconnect: draft.autoReconnect,
    };
    onSave(profile);
    setError(null);
    setEditing(null);
    setDraft(emptyDraft(defaults));
  };

  return (
    <aside className="ai-drawer hosts-drawer" aria-label={t("Host manager")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ⌂
          </span>
          <div>
            <h2>{t("HOST MANAGER")}</h2>
            <p>{t("saved connections · no passwords stored")}</p>
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

      <div className="ai-drawer__body hosts-body">
        <div className="hosts-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("filter hosts")}
            spellCheck={false}
            aria-label={t("filter hosts")}
          />
          <button type="button" onClick={startNew}>
            {t("new host")}
          </button>
          <button type="button" onClick={useCurrent} disabled={!currentTarget}>
            {t("use current")}
          </button>
          <button type="button" onClick={() => void importConfig()}>
            {t("import ssh config")}
          </button>
        </div>

        <div className="hosts-external">
          <span>{t("OpenSSH X11/agent session")}</span>
          <label>
            <input type="checkbox" checked={x11} onChange={(event) => setX11(event.target.checked)} />
            X11
          </label>
          <label>
            <input type="checkbox" checked={agent} onChange={(event) => setAgent(event.target.checked)} />
            agent
          </label>
        </div>

        <div className="hosts-list">
          {filtered.length === 0 ? (
            <p className="settings-note">{t("no saved hosts")}</p>
          ) : (
            filtered.map((host) => (
              <article className="host-card" key={host.id}>
                <div>
                  <header>
                    <b>{host.name}</b>
                    <span>{host.authMethod}</span>
                  </header>
                  <small>
                    {host.username}@{host.host}:{host.port}
                    {host.group ? ` · ${host.group}` : ""}
                  </small>
                  {host.privateKeyPath ? (
                    <code>{host.privateKeyPath}</code>
                  ) : null}
                </div>
                <div className="host-actions">
                  <button
                    type="button"
                    className="host-connect"
                    onClick={() => onConnect(host)}
                  >
                    {t("connect")}
                  </button>
                  <button
                    type="button"
                    className="host-external-btn"
                    title={t("OpenSSH X11/agent session")}
                    onClick={() => onConnectExternal(host, { x11, agent })}
                  >
                    X11/A
                  </button>
                  <button type="button" onClick={() => edit(host)}>
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    className="settings-danger"
                    onClick={() => {
                      if (!window.confirm(t("Delete host {name}?", { name: host.name }))) {
                        return;
                      }
                      onRemove(host.id);
                    }}
                  >
                    {t("delete")}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <section className="host-form">
          <h3>{editing ? t("edit host") : t("add host")}</h3>
          <div className="host-grid">
            <label>
              <span>{t("name")}</span>
              <input
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="production"
              />
            </label>
            <label>
              <span>{t("group")}</span>
              <input
                value={draft.group}
                onChange={(event) => update({ group: event.target.value })}
                placeholder="prod"
              />
            </label>
            <label className="host-wide">
              <span>{t("host")}</span>
              <input
                value={draft.host}
                onChange={(event) => update({ host: event.target.value })}
                placeholder="203.0.113.42"
                spellCheck={false}
              />
            </label>
            <label>
              <span>{t("username")}</span>
              <input
                value={draft.username}
                onChange={(event) => update({ username: event.target.value })}
                placeholder="root"
              />
            </label>
            <label>
              <span>{t("port")}</span>
              <input
                value={draft.port}
                inputMode="numeric"
                onChange={(event) => update({ port: event.target.value })}
              />
            </label>
            <label className="host-wide">
              <span>{t("authentication")}</span>
              <select
                value={draft.authMethod}
                onChange={(event) =>
                  update({ authMethod: event.target.value as SshAuthMethod })
                }
              >
                <option value="password">{t("password")}</option>
                <option value="key">{t("private key")}</option>
                <option value="agent">ssh-agent</option>
              </select>
            </label>
            {draft.authMethod === "key" ? (
              <label className="host-wide">
                <span>{t("private key")}</span>
                <input
                  value={draft.privateKeyPath}
                  onChange={(event) =>
                    update({ privateKeyPath: event.target.value })
                  }
                  placeholder="~/.ssh/id_ed25519"
                  spellCheck={false}
                />
              </label>
            ) : null}
          </div>
          <label className="host-check">
            <input
              type="checkbox"
              checked={draft.autoReconnect}
              onChange={(event) =>
                update({ autoReconnect: event.target.checked })
              }
            />
            <span>{t("auto reconnect")}</span>
          </label>
          {error ? <p className="sec-error">{error}</p> : null}
          <div className="host-form__actions">
            <button type="button" className="settings-danger" onClick={startNew}>
              {t("clear")}
            </button>
            <button type="button" className="host-save" onClick={submit}>
              {editing ? t("save changes") : t("save host")}
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
