import {
  memo,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../lib/tauri";
import { useI18n } from "../lib/i18n";
import {
  buildConversationHistory,
  isShellLanguage,
  parseAiBlocks,
} from "../lib/ai";

export type AiSeed = {
  id: number;
  text: string;
};

export type AiInsertResult = {
  ok: boolean;
  message?: string;
};

type AiSettingsView = {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keySource: "environment" | "config" | "missing" | string;
};

type AiAssistantProps = {
  open: boolean;
  onClose: () => void;
  /** Build the exact context payload at send time. */
  buildContext: (includeTerminal: boolean) => string;
  contextAvailable: boolean;
  canInsert: boolean;
  onInsert: (command: string) => AiInsertResult;
  seed: AiSeed | null;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** Excluded from model history (for example a cancelled turn). */
  transient?: boolean;
  /** Receiving SSE chunks into this message. */
  streaming?: boolean;
};

const LEGACY_CONVERSATION_KEY = "sentinel.ai.conversation.v1";
const conversationScope = (() => {
  try {
    return isTauriRuntime() ? getCurrentWindow().label : "browser";
  } catch {
    return "browser";
  }
})();
const CONVERSATION_KEY = `${LEGACY_CONVERSATION_KEY}::${conversationScope}`;
const MAX_STORED_MESSAGES = 40;

const loadConversation = (): Message[] => {
  try {
    const raw =
      window.localStorage.getItem(CONVERSATION_KEY) ??
      window.localStorage.getItem(LEGACY_CONVERSATION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Message =>
          Boolean(item) &&
          typeof item === "object" &&
          (item as Message).role !== undefined &&
          ((item as Message).role === "user" ||
            (item as Message).role === "assistant") &&
          typeof (item as Message).content === "string" &&
          typeof (item as Message).id === "number"
      )
      .filter((item) => !item.streaming)
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
};

const estimateTokens = (messages: Message[]): number =>
  messages.reduce(
    (total, message) => total + Math.ceil(message.content.length / 4),
    0
  );

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
};

const Inline = ({ text }: { text: string }) => {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code className="ai-inline" key={`i-${index}`}>
              {part.slice(1, -1)}
            </code>
          );
        }
        if (
          part.startsWith("**") &&
          part.endsWith("**") &&
          part.length > 4
        ) {
          return <strong key={`b-${index}`}>{part.slice(2, -2)}</strong>;
        }
        return <span key={`t-${index}`}>{part}</span>;
      })}
    </>
  );
};

const RichText = ({ text }: { text: string }) => {
  const lines = text.split("\n");
  return (
    <div className="ai-rich">
      {lines.map((line, index) => {
        if (/^#{1,4}\s+/.test(line)) {
          return (
            <h4 className="ai-h" key={`h-${index}`}>
              {line.replace(/^#{1,4}\s+/, "")}
            </h4>
          );
        }
        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <p className="ai-li" key={`l-${index}`}>
              <span aria-hidden>›</span>{" "}
              <Inline text={line.replace(/^\s*[-*]\s+/, "")} />
            </p>
          );
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          return (
            <p className="ai-li" key={`n-${index}`}>
              <Inline text={line.trim()} />
            </p>
          );
        }
        return (
          <p className="ai-p" key={`p-${index}`}>
            <Inline text={line} />
          </p>
        );
      })}
    </div>
  );
};

const MessageBody = ({
  content,
  canInsert,
  onInsert,
}: {
  content: string;
  canInsert: boolean;
  onInsert: (command: string) => AiInsertResult;
}) => {
  const { t } = useI18n();
  const [inserted, setInserted] = useState<number | null>(null);
  const [insertError, setInsertError] = useState<{
    index: number;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const blocks = parseAiBlocks(content);

  const insert = (code: string, index: number) => {
    const result = onInsert(code);
    if (result.ok) {
      setInserted(index);
      setInsertError(null);
      window.setTimeout(() => setInserted(null), 2400);
    } else {
      setInserted(null);
      setInsertError({
        index,
        message: result.message ?? t("Could not insert into the terminal."),
      });
    }
  };

  const copy = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return <RichText text={block.text} key={`t-${index}`} />;
        }

        const isShell = isShellLanguage(block.lang);
        return (
          <div className="ai-code" key={`c-${index}`}>
            <div className="ai-code__bar">
              <span>{block.lang || "shell"}</span>
              <div className="ai-code__actions">
                <button
                  className="ai-code__copy"
                  type="button"
                  onClick={() => void copy(block.code, index)}
                >
                  {copied === index ? "copied ✓" : "copy"}
                </button>
                {isShell ? (
                  <button
                    className="ai-code__insert"
                    type="button"
                    disabled={!canInsert}
                    title={
                      canInsert
                        ? "Insert this command at the current SSH prompt (does not press Enter)"
                        : "Connect an SSH session first"
                    }
                    onClick={() => insert(block.code, index)}
                  >
                    {inserted === index ? "inserted ✓" : "insert terminal"}
                  </button>
                ) : (
                  <span className="ai-code__readonly">{t("read only")}</span>
                )}
              </div>
            </div>
            <pre>
              <code>{block.code}</code>
            </pre>
            {inserted === index ? (
              <p className="ai-code__hint">{t("inserted · review and press Enter to run")}</p>
            ) : null}
            {insertError?.index === index ? (
              <p className="ai-code__hint ai-code__hint--error">
                {insertError.message}
              </p>
            ) : null}
          </div>
        );
      })}
    </>
  );
};

const AiSettingsPanel = ({
  settings,
  busy,
  onClose,
  onSaved,
}: {
  settings: AiSettingsView | null;
  busy: boolean;
  onClose: () => void;
  onSaved: (settings: AiSettingsView) => void;
}) => {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl ?? "");
  const [model, setModel] = useState(settings?.model ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBaseUrl(settings?.baseUrl ?? "");
    setModel(settings?.model ?? "");
  }, [settings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await invoke<AiSettingsView>("save_ai_settings", {
        apiKey: apiKey.trim() ? apiKey.trim() : null,
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        model: model.trim() ? model.trim() : null,
      });
      onSaved(next);
      setApiKey("");
      setMessage(t("Saved. Takes effect on the next message."));
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await invoke<AiSettingsView>("save_ai_settings", {
        apiKey: "",
        baseUrl: null,
        model: null,
      });
      onSaved(next);
      setApiKey("");
      setMessage(t("Saved API key cleared (keychain/config file)."));
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const answer = await invoke<string>("test_ai_connection");
      setMessage(t("Connection OK: {answer}", { answer: answer.slice(0, 80) }));
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="ai-settings" aria-label={t("AI settings")}>
      <header className="ai-settings__head">
        <div>
          <p>{t("AI SETTINGS")}</p>
          <span>
            {settings?.hasKey
              ? `key: ${settings.keySource} · configured`
              : "key: not configured"}
          </span>
        </div>
        <button
          className="ai-iconbtn"
          type="button"
          onClick={onClose}
          aria-label={t("Close AI settings")}
        >
          ✕
        </button>
      </header>

      {!settings?.hasKey ? (
        <p className="ai-settings__warn">
{t("No API key yet. Enter one below or set OPENAI_API_KEY in the environment.")}
        </p>
      ) : null}

      <label className="ai-field">
        <span>{t("api key")}</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            settings?.hasKey
              ? t("configured · leave blank to keep")
              : "sk-..."
          }
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="ai-field">
        <span>{t("base url")}</span>
        <input
          type="text"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="ai-field">
        <span>{t("model")}</span>
        <input
          type="text"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="gpt-4o-mini"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="ai-settings__row">
        <button
          className="ai-settings__save"
          type="button"
          onClick={() => void save()}
          disabled={saving || busy}
        >
          {saving ? t("saving…") : t("save")}
        </button>
        <button
          className="ai-settings__test"
          type="button"
          onClick={() => void test()}
          disabled={testing || busy || !settings?.hasKey}
        >
          {testing ? t("testing…") : t("test")}
        </button>
        {settings?.keySource !== "environment" ? (
          <button
            className="ai-settings__clear"
            type="button"
            onClick={() => void clearKey()}
            disabled={saving}
          >
            {t("clear key")}
          </button>
        ) : null}
      </div>

      <p className="ai-settings__note">
        {t("The key is stored in the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service) and is not read by the frontend. OPENAI_API_KEY takes priority if set. A legacy config key is still used as fallback.")}
      </p>
      {message ? <p className="ai-settings__ok">{message}</p> : null}
      {error ? <p className="ai-settings__error">{error}</p> : null}
    </section>
  );
};

export const AiAssistant = memo(function AiAssistant({
  open,
  onClose,
  buildContext,
  contextAvailable,
  canInsert,
  onInsert,
  seed,
}: AiAssistantProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>(loadConversation);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [seedNotice, setSeedNotice] = useState(false);
  const [includeTerminal, setIncludeTerminal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const idRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const requestIdRef = useRef("");
  const streamingIdRef = useRef<number | null>(null);

  useEffect(() => {
    idRef.current = messages.reduce(
      (max, message) => Math.max(max, message.id),
      idRef.current
    );
    // Only needed once for IDs restored from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void listen<{ requestId: string; delta: string }>(
      "ai-chunk",
      (event) => {
        if (disposed) return;
        if (event.payload.requestId !== requestIdRef.current) return;
        const id = streamingIdRef.current;
        if (id === null) return;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === id
              ? { ...message, content: message.content + event.payload.delta }
              : message
          )
        );
      }
    ).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const persistable = messages
          .filter((message) => !message.streaming)
          .slice(-MAX_STORED_MESSAGES);
        window.localStorage.setItem(
          CONVERSATION_KEY,
          JSON.stringify(persistable)
        );
      } catch {
        // Storage may be disabled; chat still works for this session.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!seed) return;
    setInput((previous) =>
      previous.trim() ? `${previous.trim()}\n${seed.text}` : seed.text
    );
    setSeedNotice(true);
    const timer = window.setTimeout(() => setSeedNotice(false), 3000);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.clearTimeout(timer);
  }, [seed]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !isTauriRuntime()) return;
    let cancelled = false;
    void invoke<AiSettingsView>("get_ai_settings")
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
          setSettingsError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) setSettingsError(toErrorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [open, settingsOpen]);

  useEffect(() => {
    if (!stickRef.current) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
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
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      document.querySelector<HTMLElement>(".terminal__ai")?.focus();
    }
  }, [open]);

  const onBodyScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;

    const history = buildConversationHistory(messages);
    const userId = nextId();
    const assistantId = nextId();
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    stickRef.current = true;
    requestIdRef.current = requestId;
    streamingIdRef.current = assistantId;
    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", content: prompt },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      },
    ]);
    setInput("");
    setBusy(true);
    setCancelling(false);

    if (!isTauriRuntime()) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: t("AI assistant is only available in the Tauri desktop app."),
                error: true,
                streaming: false,
              }
            : message
        )
      );
      streamingIdRef.current = null;
      setBusy(false);
      return;
    }

    try {
      const answer = await invoke<string>("ask_ai_stream", {
        prompt,
        context: buildContext(includeTerminal),
        history,
        requestId,
      });
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: answer || message.content,
                streaming: false,
              }
            : message
        )
      );
    } catch (caught) {
      const message = toErrorMessage(caught);
      const cancelled = /cancel/i.test(message);
      setMessages((previous) =>
        previous.map((item) => {
          if (item.id === assistantId) {
            return {
              ...item,
              content: cancelled ? t("Request cancelled.") : message,
              error: !cancelled,
              transient: cancelled,
              streaming: false,
            };
          }
          if (cancelled && item.id === userId) {
            return { ...item, transient: true };
          }
          return item;
        })
      );
    } finally {
      streamingIdRef.current = null;
      requestIdRef.current = "";
      setBusy(false);
      setCancelling(false);
    }
  };

  const cancel = async () => {
    if (!busy || cancelling) return;
    setCancelling(true);
    try {
      await invoke("cancel_ai");
    } catch (caught) {
      setCancelling(false);
      setSettingsError(toErrorMessage(caught));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <aside
      ref={panelRef}
      className="ai-drawer"
      id="ai-assistant"
      aria-label={t("AI assistant")}
    >
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ✦
          </span>
          <div>
            <p>{t("AI // COPILOT")}</p>
            <span>
              {settings?.model ?? "openai-compatible"} ·{" "}
              {contextAvailable ? t("context attached") : t("no context")} · ~
              {estimateTokens(messages)} tok
            </span>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className={`ai-iconbtn ${settingsOpen ? "is-active" : ""}`}
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            title={t("AI settings")}
            aria-label={t("AI settings")}
            aria-expanded={settingsOpen}
          >
            ⚙
          </button>
          <button
            className="ai-iconbtn"
            type="button"
            onClick={() => {
              setMessages([]);
              try {
                window.localStorage.removeItem(CONVERSATION_KEY);
                window.localStorage.removeItem(LEGACY_CONVERSATION_KEY);
              } catch {
                // ignore storage failures
              }
            }}
            disabled={busy || messages.length === 0}
            title={t("Clear conversation")}
            aria-label={t("Clear conversation")}
          >
            ⌫
          </button>
          <button
            className="ai-iconbtn ai-iconbtn--close"
            type="button"
            onClick={onClose}
            title={t("Close AI panel")}
            aria-label={t("Close AI panel")}
          >
            ✕
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <>
          <AiSettingsPanel
            settings={settings}
            busy={busy}
            onClose={() => setSettingsOpen(false)}
            onSaved={setSettings}
          />
          {settingsError ? (
            <p className="ai-settings__error">{settingsError}</p>
          ) : null}
        </>
      ) : null}

      <div
        className="ai-drawer__body"
        ref={bodyRef}
        onScroll={onBodyScroll}
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 ? (
          <div className="ai-empty">
            <pre aria-hidden>{`  ╔══════════════════╗
  ║  SENTINEL  AI    ║
  ╚══════════════════╝`}</pre>
            <p>{t("Ask AI to troubleshoot with current telemetry and the SSH session.")}</p>
            <ul>
              <li>{t("“Explain the current CPU / memory load”")}</li>
              <li>{t("“What does this error mean?”")}</li>
              <li>{t("“Give me a safe firewall check command”")}</li>
            </ul>
            <p className="ai-empty__hint">
              {t("Select text in the terminal and press Ctrl+I to attach it to the draft.")}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`ai-msg ai-msg--${message.role} ${
                message.error ? "ai-msg--error" : ""
              }`}
              key={message.id}
            >
              <header>
                <span>{message.role === "user" ? "YOU" : "SENTINEL AI"}</span>
                {message.error ? <b>{t("error")}</b> : null}
              </header>
              {message.role === "assistant" ? (
                <>
                  {message.content ? (
                    <MessageBody
                      content={message.content}
                      canInsert={canInsert}
                      onInsert={onInsert}
                    />
                  ) : null}
                  {message.streaming ? (
                    <span className="ai-stream-cursor" aria-hidden>
                      ▌
                    </span>
                  ) : null}
                </>
              ) : (
                <RichText text={message.content} />
              )}
            </article>
          ))
        )}

        {busy ? (
          <div className="ai-thinking" aria-label={t("AI is thinking")}>
            <span />
            <span />
            <span />
            {cancelling ? t("cancelling…") : t("thinking")}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <details className="ai-context-preview">
        <summary>{t("context preview")}</summary>
        <pre>{buildContext(includeTerminal).slice(0, 5000)}</pre>
      </details>

      <div className="ai-drawer__compose">
        {seedNotice ? (
          <p className="ai-seed-notice">{t("content attached to draft")}</p>
        ) : null}
        <label className="ai-context-toggle">
          <input
            type="checkbox"
            checked={includeTerminal}
            onChange={(event) => setIncludeTerminal(event.target.checked)}
            disabled={busy}
          />
          <span>{t("attach last 80 terminal lines")}</span>
        </label>
        <form onSubmit={submit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t("Ask about this VPS, a command, or the error in your terminal…")}
            rows={3}
            disabled={busy}
            aria-label={t("AI prompt")}
          />
          <div className="ai-drawer__submitrow">
            <span>
              {contextAvailable ? t("telemetry + ssh context") : t("no context")} · {t("credentials not attached")}
            </span>
            <div className="ai-drawer__buttons">
              {busy ? (
                <button
                  className="ai-stop"
                  type="button"
                  onClick={() => void cancel()}
                  disabled={cancelling}
                >
                  {cancelling ? t("stopping…") : t("stop")}
                </button>
              ) : null}
              <button
                className="ai-send"
                type="submit"
                disabled={busy || !input.trim()}
              >
                {busy ? t("waiting…") : t("send ↵")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
});
