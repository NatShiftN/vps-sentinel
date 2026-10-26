import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../lib/tauri";
import { useI18n } from "../lib/i18n";
import type {
  HistoryAudit,
  HistoryCommandSearchRow,
  HistoryDetail,
  HistoryOutputChunk,
  HistorySession,
  HistoryStats,
} from "../lib/history";

type Props = {
  open: boolean;
  onClose: () => void;
};

const stripAnsi = (value: string) =>
  value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-_]/g, "");

const formatTime = (value: number | null) => {
  if (!value) return "—";
  const date = new Date(value * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type Tab = "output" | "commands" | "audits";

export function HistoryPanel({ open, onClose }: Props) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [search, setSearch] = useState("");
  const [commandQuery, setCommandQuery] = useState("");
  const [commandResults, setCommandResults] = useState<
    HistoryCommandSearchRow[]
  >([]);
  const [commandSearching, setCommandSearching] = useState(false);
  const [replayChunks, setReplayChunks] = useState<HistoryOutputChunk[] | null>(
    null
  );
  const [tab, setTab] = useState<Tab>("output");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadList = useCallback(async (query = "") => {
    if (!isTauriRuntime()) {
      setError("History is available inside the Tauri desktop app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [list, nextStats] = await Promise.all([
        invoke<HistorySession[]>("list_history_sessions", {
          limit: 200,
          search: query,
        }),
        invoke<HistoryStats>("history_stats"),
      ]);
      setSessions(list);
      setStats(nextStats);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadList(search);
  }, [open, loadList]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const openSessionById = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      const next = await invoke<HistoryDetail>("get_history_session", {
        id,
      });
      setDetail(next);
      setTab("output");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const openSession = (session: HistorySession) =>
    openSessionById(session.id);

  const searchCommands = async () => {
    if (!commandQuery.trim()) {
      setCommandResults([]);
      return;
    }
    setCommandSearching(true);
    setError(null);
    try {
      const rows = await invoke<HistoryCommandSearchRow[]>(
        "search_history_commands",
        { query: commandQuery, limit: 100 }
      );
      setCommandResults(rows);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setCommandSearching(false);
    }
  };

  const deleteSession = async () => {
    if (!detail) return;
    if (!window.confirm(t("Delete history for {host}?", { host: detail.session.host }))) return;
    try {
      await invoke("delete_history_session", { id: detail.session.id });
      setDetail(null);
      setStatus(t("session deleted"));
      await loadList(search);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const clearAll = async () => {
    if (!window.confirm(t("Delete ALL stored session history?"))) return;
    try {
      await invoke("clear_history");
      setDetail(null);
      setStatus(t("history cleared"));
      await loadList(search);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const startReplay = async () => {
    if (!detail) return;
    try {
      const chunks = await invoke<HistoryOutputChunk[]>("get_history_replay", {
        id: detail.session.id,
      });
      if (chunks.length === 0) {
        setError(t("No output available for replay."));
        return;
      }
      setReplayChunks(chunks);
    } catch (caught) {
      setError(String(caught));
    }
  };

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
    setStatus(t("copied"));
  };

  return (
    <aside className="ai-drawer history-drawer" aria-label={t("Session history")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ◷
          </span>
          <div>
            <h2>{t("SESSION HISTORY")}</h2>
            <p>
              {t("SQLite · {count} sessions · {size}", { count: stats?.sessions ?? 0, size: formatBytes(stats?.outputBytes ?? 0) })}
            </p>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className="ai-iconbtn"
            type="button"
            onClick={() => void loadList(search)}
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

      <div className="ai-drawer__body history-body">
        <div className="history-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void loadList(search);
              }
            }}
            placeholder={t("filter host / user / status")}
            spellCheck={false}
            aria-label={t("Search history")}
          />
          <button type="button" onClick={() => void loadList(search)}>
            {t("search")}
          </button>
          <button type="button" className="settings-danger" onClick={() => void clearAll()}>
            {t("clear all")}
          </button>
        </div>

        <div className="history-command-search">
          <input
            value={commandQuery}
            onChange={(event) => setCommandQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void searchCommands();
              }
            }}
            placeholder={t("search command history")}
            aria-label={t("search command history")}
            spellCheck={false}
          />
          <button type="button" onClick={() => void searchCommands()}>
            {t("search commands")}
          </button>
        </div>
        {commandResults.length > 0 ? (
          <div className="history-command-results">
            {commandResults.map((row) => (
              <div
                className="history-command-result"
                key={`${row.sessionId}-${row.ts}-${row.command}`}
              >
                <button
                  type="button"
                  onClick={() => void openSessionById(row.sessionId)}
                >
                  <code>{row.command}</code>
                  <small>
                    {row.username}@{row.host}:{row.port} · {formatTime(row.ts)}
                  </small>
                </button>
                <button type="button" onClick={() => copy(row.command)}>
                  {t("copy")}
                </button>
              </div>
            ))}
          </div>
        ) : commandSearching ? (
          <p className="settings-note">{t("working…")}</p>
        ) : null}

        <p className="settings-note">
          {t("Output is stored unencrypted in the app config directory. It may contain secrets; commands are captured only when enabled in Settings.")}
        </p>

        {error ? <p className="sec-error">{error}</p> : null}
        {status ? <p className="sftp-status">{status}</p> : null}
        {busy ? <p className="sftp-status">{t("working…")}</p> : null}

        <div className="history-list">
          {sessions.length === 0 ? (
            <p className="settings-note">{t("no recorded sessions")}</p>
          ) : (
            sessions.map((session) => (
              <button
                className={`history-session ${
                  detail?.session.id === session.id ? "is-active" : ""
                }`}
                type="button"
                key={session.id}
                onClick={() => void openSession(session)}
              >
                <span className="history-session__host">
                  {session.username}@{session.host}:{session.port}
                </span>
                <span className={`history-session__status is-${session.status}`}>
                  {t(session.status)}
                </span>
                <span className="history-session__time">
                  {formatTime(session.startedAt)}
                </span>
                <span className="history-session__meta">
                  {formatBytes(session.outputBytes)} · {session.commandCount}{" "}
                  cmds · {session.auditCount} audits
                </span>
              </button>
            ))
          )}
        </div>

        {detail ? (
          <section className="history-detail">
            <header className="history-detail__head">
              <div>
                <b>
                  {detail.session.username}@{detail.session.host}:
                  {detail.session.port}
                </b>
                <small>
                  {t("started {start} · ended {end} · auth {auth}", { start: formatTime(detail.session.startedAt), end: formatTime(detail.session.endedAt), auth: detail.session.authMethod })}
                </small>
              </div>
              <button
                className="settings-danger"
                type="button"
                onClick={() => void deleteSession()}
              >
                {t("delete")}
              </button>
              <button
                className="history-replay-button"
                type="button"
                onClick={() => void startReplay()}
              >
                {t("replay")}
              </button>
            </header>

            <div className="history-tabs" role="tablist">
              {(
                [
                  ["output", t("output {size}", { size: formatBytes(detail.session.outputBytes) })],
                  ["commands", t("commands {count}", { count: detail.commands.length })],
                  ["audits", t("audits {count}", { count: detail.audits.length })],
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

            {tab === "output" ? (
              <>
                {detail.outputTruncated ? (
                  <p className="settings-note">
                    {t("output truncated to the first 2 MB")}
                  </p>
                ) : null}
                <pre className="history-output">
                  {stripAnsi(detail.output) || t("(no output recorded)")}
                </pre>
              </>
            ) : null}

            {tab === "commands" ? (
              <div className="history-commands">
                {detail.commands.length === 0 ? (
                  <p className="settings-note">
                    {t("no commands captured. Enable “Capture typed commands” in Settings before connecting.")}
                  </p>
                ) : (
                  detail.commands.map((command) => (
                    <div className="history-command" key={command.id}>
                      <span>{formatTime(command.ts)}</span>
                      <code>{command.command}</code>
                      <button type="button" onClick={() => copy(command.command)}>
                        {t("copy")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {tab === "audits" ? (
              <div className="history-audits">
                {detail.audits.length === 0 ? (
                  <p className="settings-note">{t("no audit records")}</p>
                ) : (
                  detail.audits.map((audit) => <AuditCard key={audit.id} audit={audit} />)
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      {replayChunks ? (
        <ReplayOverlay
          chunks={replayChunks}
          onClose={() => setReplayChunks(null)}
        />
      ) : null}
    </aside>
  );
}

function ReplayOverlay({
  chunks,
  onClose,
}: {
  chunks: HistoryOutputChunk[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((previous) => {
        if (previous >= chunks.length) {
          setPlaying(false);
          return previous;
        }
        return Math.min(chunks.length, previous + speed);
      });
    }, 45);
    return () => window.clearInterval(timer);
  }, [playing, speed, chunks.length]);

  const text = stripAnsi(
    chunks
      .slice(0, index)
      .map((chunk) => chunk.data)
      .join("")
  );
  const done = index >= chunks.length;

  return (
    <div className="replay-overlay" role="dialog" aria-modal="true">
      <div className="replay-panel">
        <header>
          <b>{t("session replay")}</b>
          <div>
            <button type="button" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}>
              {speed}x
            </button>
            <button
              type="button"
              onClick={() => {
                if (done) setIndex(1);
                setPlaying((value) => !value);
              }}
            >
              {playing ? t("pause") : t("play")}
            </button>
            <button type="button" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </header>
        <pre>{text || t("starting replay…")}</pre>
        <footer>
          <span>
            {index} / {chunks.length}
          </span>
          <span>{done ? t("finished") : t("replaying")}</span>
        </footer>
      </div>
    </div>
  );
}

function AuditCard({ audit }: { audit: HistoryAudit }) {
  const { t } = useI18n();
  return (
    <article className="history-audit">
      <header>
        <b>{formatTime(audit.ts)}</b>
        <span>{t("{count} findings", { count: audit.findings.length })}</span>
      </header>
      {audit.findings.length > 0 ? (
        <div className="history-audit__findings">
          {audit.findings.map((finding, index) => (
            <div className={`history-finding is-${finding.severity ?? "info"}`} key={`${finding.id ?? index}`}>
              <b>{finding.title ?? finding.id ?? "finding"}</b>
              <span>{finding.severity ?? "info"}</span>
              <p>{finding.detail ?? ""}</p>
            </div>
          ))}
        </div>
      ) : (
        <pre className="history-output">{audit.raw.slice(0, 6000)}</pre>
      )}
    </article>
  );
}
