import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import type { SftpChunk, SftpEntry, SftpListing } from "../lib/sftp";
import { SFTP_CHUNK_BYTES, SFTP_MAX_BYTES } from "../lib/sftp";
import { useI18n } from "../lib/i18n";

type Props = {
  open: boolean;
  canBrowse: boolean;
  onClose: () => void;
  downloadDirectory: string;
  list: (path: string) => Promise<SftpListing>;
  downloadChunk: (
    path: string,
    offset: number,
    length: number
  ) => Promise<SftpChunk>;
  uploadChunk: (
    path: string,
    offset: number,
    dataBase64: string,
    truncate: boolean
  ) => Promise<number>;
  remove: (path: string, isDir: boolean) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

type DownloadJob = {
  kind: "download";
  path: string;
  name: string;
  offset: number;
  size: number;
  chunks: Uint8Array[];
  savePath: string;
  error?: string;
};

type UploadJob = {
  kind: "upload";
  path: string;
  name: string;
  offset: number;
  size: number;
  file: File;
  error?: string;
};

type Transfer = DownloadJob | UploadJob;

type DownloadRecord = {
  id: string;
  name: string;
  path: string;
  size: number;
  status: "done" | "error";
  ts: number;
  error?: string;
};

const DOWNLOAD_STORAGE_KEY = "sentinel.downloads.v1";

const loadDownloadRecords = (): DownloadRecord[] => {
  try {
    const raw = window.localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is DownloadRecord =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as DownloadRecord).name === "string" &&
          typeof (item as DownloadRecord).path === "string"
      )
      .slice(0, 50);
  } catch {
    return [];
  }
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

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

const joinPath = (base: string, name: string) =>
  `${base.replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`.replace(
    /\/{2,}/g,
    "/"
  );

const base64ToBytes = (data: string) => {
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
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
    reader.readAsDataURL(blob);
  });

export function SftpPanel({
  open,
  canBrowse,
  onClose,
  downloadDirectory,
  list,
  downloadChunk,
  uploadChunk,
  remove,
  rename,
  mkdir,
}: Props) {
  const { t } = useI18n();
  const [listing, setListing] = useState<SftpListing | null>(null);
  const [pathInput, setPathInput] = useState(".");
  const [selected, setSelected] = useState<SftpEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadRecord[]>(loadDownloadRecords);
  const [moreEntry, setMoreEntry] = useState<{ entry: SftpEntry } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (path: string) => {
      if (!canBrowse) {
        setError(t("Connect SSH before browsing remote files."));
        return;
      }
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        const result = await list(path);
        setListing(result);
        setPathInput(result.path);
        setSelected(null);
      } catch (caught) {
        setError(String(caught));
      } finally {
        setBusy(false);
      }
    },
    [canBrowse, list]
  );

  useEffect(() => {
    if (open && canBrowse) {
      void load(".");
    }
  }, [open, canBrowse, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOWNLOAD_STORAGE_KEY, JSON.stringify(downloads));
    } catch {
      // ignore storage failures
    }
  }, [downloads]);

  useEffect(() => {
    if (!moreEntry) return;
    const close = (event?: MouseEvent) => {
      if ((event?.target as Element | null)?.closest?.(".sftp-more-menu")) {
        return;
      }
      setMoreEntry(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreEntry]);

  if (!open) return null;

  const currentPath = listing?.path ?? ".";
  const parentPath =
    currentPath === "/" || currentPath === "."
      ? currentPath
      : currentPath.replace(/\/[^/]+\/?$/, "") || "/";

  const addDownloadRecord = (record: DownloadRecord) => {
    setDownloads((previous) => [record, ...previous].slice(0, 50));
  };

  const runDownload = async (job: DownloadJob) => {
    setTransferBusy(true);
    setError(null);
    let current = job;
    try {
      for (;;) {
        const chunk = await downloadChunk(
          job.path,
          current.offset,
          SFTP_CHUNK_BYTES
        );
        const bytes = base64ToBytes(chunk.data);
        if (chunk.offset <= current.offset && !chunk.eof) {
          throw new Error("SFTP download did not advance.");
        }
        current = {
          ...current,
          offset: chunk.offset,
          size: chunk.size,
          chunks: [...current.chunks, bytes],
          error: undefined,
        };
        setTransfer(current);
        if (chunk.eof) break;
      }

      const total = current.chunks.reduce(
        (sum, chunk) => sum + chunk.length,
        0
      );
      const merged = new Uint8Array(total);
      let at = 0;
      for (const chunk of current.chunks) {
        merged.set(chunk, at);
        at += chunk.length;
      }
      await invoke("save_download_file", {
        path: current.savePath,
        dataBase64: bytesToBase64(merged),
      });
      addDownloadRecord({
        id: `${Date.now()}-${current.name}`,
        name: current.name,
        path: current.savePath,
        size: current.size,
        status: "done",
        ts: Date.now(),
      });
      setTransfer(null);
      setStatus(
        t("saved {name} · {size}", {
          name: current.name,
          size: formatBytes(current.size),
        })
      );
    } catch (caught) {
      setTransfer({ ...current, error: String(caught) });
      setError(String(caught));
      addDownloadRecord({
        id: `${Date.now()}-${current.name}`,
        name: current.name,
        path: current.savePath,
        size: current.size,
        status: "error",
        ts: Date.now(),
        error: String(caught),
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const runUpload = async (job: UploadJob) => {
    setTransferBusy(true);
    setError(null);
    let current = job;
    try {
      if (current.size === 0) {
        await uploadChunk(current.path, 0, "", true);
        current = { ...current, offset: 0 };
      }
      while (current.offset < current.size) {
        const slice = current.file.slice(
          current.offset,
          Math.min(current.offset + SFTP_CHUNK_BYTES, current.size)
        );
        const data = await blobToBase64(slice);
        const next = await uploadChunk(
          current.path,
          current.offset,
          data,
          current.offset === 0
        );
        if (next <= current.offset) {
          throw new Error("SFTP upload did not advance.");
        }
        current = { ...current, offset: next, error: undefined };
        setTransfer(current);
      }
      await load(currentPath);
      setTransfer(null);
      setStatus(`uploaded ${current.name} · ${formatBytes(current.size)}`);
    } catch (caught) {
      setTransfer({ ...current, error: String(caught) });
      setError(String(caught));
    } finally {
      setTransferBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const startDownload = async (entry: SftpEntry) => {
    if (entry.isDir || transferBusy) return;
    setError(null);
    let savePath: string | null = null;
    try {
      savePath = await invoke<string | null>("pick_save_path", {
        defaultDir: downloadDirectory || null,
        fileName: entry.name,
      });
    } catch (caught) {
      setError(String(caught));
      return;
    }
    if (!savePath) return;
    const job: DownloadJob = {
      kind: "download",
      path: entry.path,
      name: entry.name,
      offset: 0,
      size: entry.size,
      chunks: [],
      savePath,
    };
    setTransfer(job);
    void runDownload(job);
  };

  const startUpload = (file: File) => {
    if (!listing || transferBusy) return;
    if (file.size > SFTP_MAX_BYTES) {
      setError(
        `File is too large; the SFTP limit is ${
          SFTP_MAX_BYTES / (1024 * 1024)
        } MB.`
      );
      return;
    }
    const target = joinPath(currentPath, file.name);
    const existing = listing.entries.find(
      (entry) => !entry.isDir && entry.name === file.name
    );
    if (
      existing &&
      !window.confirm(`Overwrite ${target} on the remote host?`)
    ) {
      if (uploadRef.current) uploadRef.current.value = "";
      return;
    }
    const job: UploadJob = {
      kind: "upload",
      path: target,
      name: file.name,
      offset: 0,
      size: file.size,
      file,
    };
    setTransfer(job);
    void runUpload(job);
  };

  const handleDelete = async (entry?: SftpEntry) => {
    const target = entry ?? selected;
    if (!target || transferBusy) return;
    if (
      !window.confirm(
        `Delete ${target.path}${target.isDir ? " (directory)" : ""}?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await remove(target.path, target.isDir);
      await load(currentPath);
      setStatus(`deleted ${target.name}`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (entry?: SftpEntry) => {
    const target = entry ?? selected;
    if (!target || transferBusy) return;
    const next = window.prompt(`Rename ${target.name} to:`, target.name);
    if (!next || next === target.name) return;
    if (/[\\/]/.test(next)) {
      setError("Rename must be a file name, not a path.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rename(target.path, joinPath(currentPath, next));
      await load(currentPath);
      setStatus(`renamed to ${next}`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleMkdir = async () => {
    if (transferBusy) return;
    const name = window.prompt("New directory name:");
    if (!name) return;
    if (/[\\/]/.test(name)) {
      setError("Directory name must not contain a slash.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mkdir(joinPath(currentPath, name));
      await load(currentPath);
      setStatus(`created ${name}`);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  };

  const transferPercent =
    transfer && transfer.size > 0
      ? Math.min(100, Math.round((transfer.offset / transfer.size) * 100))
      : transfer
        ? 100
        : 0;

  return (
    <aside className="ai-drawer sftp-drawer" aria-label={t("SFTP file browser")}>
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ▤
          </span>
          <div>
            <h2>SFTP</h2>
            <p>{t("remote files · active tab · max 4 MB")}</p>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className="ai-iconbtn"
            type="button"
            onClick={() => void load(currentPath)}
            disabled={busy || transferBusy || !canBrowse}
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

      <div className="ai-drawer__body sftp-body">
        {!canBrowse ? (
          <p className="sec-empty">{t("Connect SSH before browsing remote files.")}</p>
        ) : (
          <>
            <div className="sftp-pathbar">
              <button
                className="sftp-up"
                type="button"
                onClick={() => void load(parentPath)}
                disabled={
                  busy ||
                  transferBusy ||
                  currentPath === "/" ||
                  currentPath === "."
                }
                title={t("Parent directory")}
              >
                ↑
              </button>
              <input
                className="sftp-path"
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void load(pathInput);
                  }
                }}
                spellCheck={false}
                aria-label={t("Remote path")}
              />
              <button
                className="sftp-go"
                type="button"
                onClick={() => void load(pathInput)}
                disabled={busy || transferBusy}
              >
                {t("go")}
              </button>
              <button
                className="sftp-go"
                type="button"
                onClick={() => uploadRef.current?.click()}
                disabled={busy || transferBusy}
              >
                {t("upload")}
              </button>
              <button
                className="sftp-go"
                type="button"
                onClick={() => void handleMkdir()}
                disabled={busy || transferBusy}
              >
                {t("new folder")}
              </button>
              <button
                className="sftp-go"
                type="button"
                onClick={() => void handleRename()}
                disabled={busy || transferBusy || !selected}
              >
                {t("rename")}
              </button>
              <button
                className="sftp-go sftp-go--danger"
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy || transferBusy || !selected}
              >
                {t("delete")}
              </button>
              <input
                ref={uploadRef}
                type="file"
                className="sftp-upload-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) startUpload(file);
                }}
              />
            </div>

            {error ? <p className="sec-error">{error}</p> : null}
            {status ? <p className="sftp-status">{status}</p> : null}

            {transfer ? (
              <div className="sftp-transfer">
                <div className="sftp-transfer__head">
                  <span>
                    {transfer.kind === "download" ? "↓" : "↑"} {transfer.name}
                  </span>
                  <span>
                    {formatBytes(transfer.offset)} /{" "}
                    {formatBytes(transfer.size)} · {transferPercent}%
                  </span>
                </div>
                <div className="sftp-progress">
                  <span style={{ width: `${transferPercent}%` }} />
                </div>
                {transfer.error ? (
                  <div className="sftp-transfer__error">
                    <span>{transfer.error}</span>
                    <button
                      className="sftp-resume"
                      type="button"
                      disabled={transferBusy}
                      onClick={() => {
                        if (transfer.kind === "download") {
                          void runDownload(transfer);
                        } else {
                          void runUpload(transfer);
                        }
                      }}
                    >
                      {t("resume")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {busy ? <p className="sftp-status">{t("working…")}</p> : null}

            <div className="sftp-list" role="list">
              {listing?.entries.length === 0 ? (
                <p className="sec-empty">{t("empty directory")}</p>
              ) : (
                listing?.entries.map((entry) => (
                  <div
                    key={entry.path}
                    className={`sftp-row ${
                      selected?.path === entry.path ? "is-selected" : ""
                    }`}
                    role="listitem"
                  >
                    <button
                      className="sftp-entry"
                      type="button"
                      onClick={() => {
                        if (entry.isDir) {
                          void load(entry.path);
                        } else {
                          setSelected(entry);
                        }
                      }}
                    >
                      <span className="sftp-icon" aria-hidden>
                        {entry.isDir ? "▸" : "·"}
                      </span>
                      <span className="sftp-name">{entry.name}</span>
                      <span className="sftp-size">
                        {entry.isDir ? t("dir") : formatBytes(entry.size)}
                      </span>
                      <span className="sftp-time">
                        {formatTime(entry.modified)}
                      </span>
                    </button>
                    {!entry.isDir ? (
                      <button
                        className="sftp-download"
                        type="button"
                        onClick={() => startDownload(entry)}
                        disabled={busy || transferBusy}
                        title={t("download {name}", { name: entry.name })}
                      >
                        ↓
                      </button>
                    ) : null}
                    <button
                      className="sftp-select"
                      type="button"
                      aria-haspopup="menu"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(entry);
                        setMoreEntry({ entry });
                      }}
                      title={t("more options for {name}", { name: entry.name })}
                      aria-label={t("more options for {name}", { name: entry.name })}
                    >
                      ⋯
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="sftp-foot">
              <span>
                {listing?.truncated
                  ? t("listing truncated at 500 entries")
                  : t("{count} entries", { count: listing?.entries.length ?? 0 })}
              </span>
              <span>{t("chunked · upload overwrites · no delete of non-empty dirs")}</span>
            </div>

            <details className="sftp-downloads" open>
              <summary>
                {t("Downloads")} · {downloads.length}
              </summary>
              <div className="sftp-download-list">
                {downloads.length === 0 ? (
                  <p className="settings-note">{t("no downloads yet")}</p>
                ) : (
                  downloads.map((record) => (
                    <div className={`sftp-download ${record.status}`} key={record.id}>
                      <div>
                        <b>{record.name}</b>
                        <small>
                          {formatBytes(record.size)} ·{" "}
                          {record.status === "done" ? t("done") : t("failed")} ·{" "}
                          {record.path}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void invoke("open_download_location", {
                            path: record.path,
                          }).catch((caught) => setError(String(caught)))
                        }
                        title={t("Open download location")}
                      >
                        {t("open")}
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                className="sftp-download-clear"
                type="button"
                onClick={() => setDownloads([])}
              >
                {t("clear list")}
              </button>
            </details>
          </>
        )}
      </div>
      {moreEntry
        ? createPortal(
            <div
              className="sftp-more-backdrop"
              onMouseDown={() => setMoreEntry(null)}
            >
              <div
                className="sftp-more-menu"
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
          {!moreEntry.entry.isDir ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const entry = moreEntry.entry;
                setMoreEntry(null);
                void startDownload(entry);
              }}
            >
              {t("download")}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const entry = moreEntry.entry;
              setMoreEntry(null);
              void handleRename(entry);
            }}
          >
            {t("rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const entry = moreEntry.entry;
              setMoreEntry(null);
              void handleDelete(entry);
            }}
          >
            {t("delete")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(moreEntry.entry.path)
                .catch(() => undefined);
              setMoreEntry(null);
              setStatus(t("copied"));
            }}
          >
            {t("copy path")}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </aside>
  );
}
