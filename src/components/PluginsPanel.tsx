import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  validatePlugin,
  type Plugin,
  type ProviderItem,
} from "../lib/plugins";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  plugins: Plugin[];
  disabledIds: string[];
  onToggle: (id: string, enabled: boolean) => void;
  onInstall: (plugin: Plugin) => void;
  onRemove: (id: string) => void;
  canInsert: boolean;
  aiEnabled: boolean;
  onInsertSnippet: (command: string) => string | null;
  onUsePrompt: (prompt: string) => string | null;
};

export function PluginsPanel({
  open,
  onClose,
  plugins,
  disabledIds,
  onToggle,
  onInstall,
  onRemove,
  canInsert,
  aiEnabled,
  onInsertSnippet,
  onUsePrompt,
}: Props) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<"snippets" | "prompts" | "providers" | "manage">(
    "snippets"
  );
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatus(null);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const enabled = (plugin: Plugin) => !disabledIds.includes(plugin.id);
  const snippets = plugins
    .filter((plugin) => enabled(plugin) && plugin.kind === "snippets")
    .flatMap((plugin) =>
      (plugin.snippets ?? []).map((snippet) => ({ plugin, snippet }))
    );
  const prompts = plugins
    .filter((plugin) => enabled(plugin) && plugin.kind === "ai")
    .flatMap((plugin) =>
      (plugin.prompts ?? []).map((prompt) => ({ plugin, prompt }))
    );
  const providers = plugins
    .filter((plugin) => enabled(plugin) && plugin.kind === "ai")
    .flatMap((plugin) =>
      (plugin.providers ?? []).map((provider) => ({ plugin, provider }))
    );

  const insert = (command: string) => {
    const result = onInsertSnippet(command);
    if (result) {
      setError(result);
      setStatus(null);
    } else {
      setError(null);
      setStatus(t("inserted into the active terminal — not executed"));
    }
  };

  const usePrompt = (prompt: string) => {
    const result = onUsePrompt(prompt);
    if (result) {
      setError(result);
      setStatus(null);
    } else {
      setError(null);
      setStatus(t("prompt loaded into AI"));
    }
  };

  const applyProvider = async (provider: ProviderItem) => {
    if (!aiEnabled) {
      setError(t("AI module is disabled in Settings."));
      return;
    }
    if (
      !window.confirm(
        `Apply provider preset "${provider.name}"?\n\n${provider.baseUrl}\nmodel: ${provider.model}\n\nThe API key is unchanged.`
      )
    ) {
      return;
    }
    try {
      await invoke("save_ai_settings", {
        baseUrl: provider.baseUrl,
        model: provider.model,
      });
      setError(null);
      setStatus(
        t("applied {name}; reopen AI settings to see the new endpoint", { name: provider.name })
      );
    } catch (caught) {
      setError(String(caught));
    }
  };

  const install = async (file: File) => {
    setError(null);
    setStatus(null);
    if (file.size > 64 * 1024) {
      setError(t("Plugin manifest must be smaller than 64 KB."));
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const plugin = validatePlugin(raw);
      if (plugins.some((item) => item.id === plugin.id)) {
        setError(t("A plugin with id \"{id}\" already exists.", { id: plugin.id }));
        return;
      }
      onInstall(plugin);
      setStatus(t("installed {name}", { name: plugin.name }));
    } catch (caught) {
      setError(String(caught));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <aside className="ai-drawer plugins-drawer" aria-label={t("Plugin hub")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ▦
          </span>
          <div>
            <h2>{t("PLUGIN HUB")}</h2>
            <p>{t("snippets · prompts · provider presets · local JSON")}</p>
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

      <div className="ai-drawer__body plugins-body">
        <div className="plugins-tabs" role="tablist">
          {(
            [
              ["snippets", `${t("snippets")} ${snippets.length}`],
              ["prompts", `${t("prompts")} ${prompts.length}`],
              ["providers", `${t("providers")} ${providers.length}`],
              ["manage", t("manage")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "is-active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "snippets" ? (
          <section className="plugins-section">
            <p className="settings-note">
              {t("Insert only — commands are not executed automatically. Review before pressing Enter.")}
            </p>
            {snippets.length === 0 ? (
              <p className="settings-note">{t("No enabled snippet plugins.")}</p>
            ) : (
              snippets.map(({ plugin, snippet }) => (
                <article className="plugin-item" key={`${plugin.id}-${snippet.id}`}>
                  <div>
                    <b>{snippet.name}</b>
                    <small>
                      {snippet.description} · {plugin.name}
                    </small>
                    <code>{snippet.command}</code>
                  </div>
                  <button
                    type="button"
                    disabled={!canInsert}
                    onClick={() => insert(snippet.command)}
                  >
                    {t("insert")}
                  </button>
                </article>
              ))
            )}
          </section>
        ) : null}

        {tab === "prompts" ? (
          <section className="plugins-section">
            <p className="settings-note">
              {t("Loads a prompt into the AI composer; review before sending.")}
            </p>
            {!aiEnabled ? (
              <p className="settings-note">{t("AI module is disabled in Settings.")}</p>
            ) : prompts.length === 0 ? (
              <p className="settings-note">{t("No enabled prompt plugins.")}</p>
            ) : (
              prompts.map(({ plugin, prompt }) => (
                <article className="plugin-item" key={`${plugin.id}-${prompt.id}`}>
                  <div>
                    <b>{prompt.name}</b>
                    <small>
                      {prompt.description} · {plugin.name}
                    </small>
                    <p>{prompt.prompt}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!aiEnabled}
                    onClick={() => usePrompt(prompt.prompt)}
                  >
                    {t("use")}
                  </button>
                </article>
              ))
            )}
          </section>
        ) : null}

        {tab === "providers" ? (
          <section className="plugins-section">
            <p className="settings-note">
              {t("Applies base URL and model only. API keys stay in AI settings and are never stored in plugins.")}
            </p>
            {!aiEnabled ? (
              <p className="settings-note">{t("AI module is disabled in Settings.")}</p>
            ) : providers.length === 0 ? (
              <p className="settings-note">{t("No enabled provider plugins.")}</p>
            ) : (
              providers.map(({ plugin, provider }) => (
                <article
                  className="plugin-item"
                  key={`${plugin.id}-${provider.id}`}
                >
                  <div>
                    <b>{provider.name}</b>
                    <small>
                      {provider.description} · {plugin.name}
                    </small>
                    <code>
                      {provider.baseUrl} · {provider.model}
                    </code>
                  </div>
                  <button
                    type="button"
                    disabled={!aiEnabled}
                    onClick={() => void applyProvider(provider)}
                  >
                    {t("apply")}
                  </button>
                </article>
              ))
            )}
          </section>
        ) : null}

        {tab === "manage" ? (
          <section className="plugins-section">
            <p className="settings-note">
              {t("Safe declarative plugins only: snippets, prompts and endpoint presets. No JavaScript, HTML, CSS or executable code.")}
            </p>
            <div className="plugins-list">
              {plugins.map((plugin) => (
                <article className="plugin-card" key={plugin.id}>
                  <header>
                    <b>{plugin.name}</b>
                    <span>{plugin.builtin ? t("built-in") : plugin.version}</span>
                  </header>
                  <p>{plugin.description}</p>
                  <small>
                    {plugin.kind} · {plugin.author} ·{" "}
                    {(plugin.snippets?.length ?? 0) +
                      (plugin.prompts?.length ?? 0) +
                      (plugin.providers?.length ?? 0)}{" "}
                    items
                  </small>
                  <div className="theme-actions">
                    <button
                      type="button"
                      onClick={() => onToggle(plugin.id, !enabled(plugin))}
                    >
                      {enabled(plugin) ? t("disable") : t("enable")}
                    </button>
                    {!plugin.builtin ? (
                      <button
                        type="button"
                        className="settings-danger"
                        onClick={() => {
                          if (!window.confirm(`Remove ${plugin.name}?`)) return;
                          onRemove(plugin.id);
                          setStatus(t("removed {name}", { name: plugin.name }));
                        }}
                      >
                        {t("remove")}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="settings-actions">
              <button
                className="settings-action"
                type="button"
                onClick={() => importRef.current?.click()}
              >
                {t("import plugin .json")}
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="theme-import-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void install(file);
                }}
              />
            </div>
          </section>
        ) : null}

        {error ? <p className="sec-error">{error}</p> : null}
        {status ? <p className="sftp-status">{status}</p> : null}
      </div>
    </aside>
  );
}
