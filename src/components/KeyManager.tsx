import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../lib/tauri";
import { useI18n } from "../lib/i18n";

type KeyInfo = {
  name: string;
  privatePath: string;
  publicPath: string;
  publicKey: string;
  modified: number;
};

export function KeyManager() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [name, setName] = useState("id_ed25519");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTauriRuntime()) return;
    try {
      setKeys(await invoke<KeyInfo[]>("list_ssh_keys"));
      setError(null);
    } catch (caught) {
      setError(String(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const key = await invoke<KeyInfo>("generate_ssh_key", { name });
      setKeys((previous) => [key, ...previous.filter((item) => item.name !== key.name)]);
      setStatus(t("Generated {name}.", { name: key.name }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (key: KeyInfo) => {
    if (!window.confirm(t("Delete key {name}? This cannot be undone.", { name: key.name }))) {
      return;
    }
    setBusy(true);
    try {
      await invoke("delete_ssh_key", { name: key.name });
      setKeys((previous) => previous.filter((item) => item.name !== key.name));
      setStatus(t("Deleted {name}.", { name: key.name }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setStatus(t("copied"));
  };

  return (
    <section className="settings-section">
      <h3>{t("ssh keys")}</h3>
      <p className="settings-note">{t("Keys live in ~/.ssh; private key contents are never read by the UI.")}</p>

      <div className="keys-toolbar">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="id_ed25519"
          spellCheck={false}
          aria-label={t("new key name")}
        />
        <button type="button" className="settings-action" onClick={() => void generate()} disabled={busy}>
          {t("generate ed25519")}
        </button>
        <button
          type="button"
          className="settings-action"
          onClick={() => {
            if (!isTauriRuntime()) return;
            void invoke("open_ssh_folder").catch((caught) => setError(String(caught)));
          }}
        >
          {t("open ~/.ssh")}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="settings-note">{t("no ssh keys")}</p>
      ) : (
        <div className="keys-list">
          {keys.map((key) => (
            <article className="key-card" key={key.name}>
              <div>
                <b>{key.name}</b>
                <small>{key.privatePath}</small>
                <code>{key.publicKey.slice(0, 120)}</code>
              </div>
              <div className="key-actions">
                <button type="button" onClick={() => copy(key.publicKey)}>
                  {t("copy public key")}
                </button>
                <button type="button" className="settings-danger" onClick={() => void remove(key)}>
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {error ? <p className="sec-error">{error}</p> : null}
      {status ? <p className="sftp-status">{status}</p> : null}
    </section>
  );
}
