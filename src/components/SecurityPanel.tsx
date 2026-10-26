import { useState } from "react";
import type { SecurityAudit } from "../lib/security";
import { useI18n } from "../lib/i18n";

type SecurityPanelProps = {
  open: boolean;
  onClose: () => void;
  canScan: boolean;
  onAskAi: (text: string) => void;
  onRun: () => Promise<SecurityAudit>;
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
};

const severityLabel: Record<string, string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO",
};

export function SecurityPanel({
  open,
  onClose,
  canScan,
  onAskAi,
  onRun,
}: SecurityPanelProps) {
  const { t } = useI18n();
  const [audit, setAudit] = useState<SecurityAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!canScan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onRun();
      setAudit(result);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const askAi = () => {
    if (!audit) return;
    const findings = audit.findings
      .map(
        (finding) =>
          `[${finding.severity.toUpperCase()}] ${finding.title}\n` +
          `detail: ${finding.detail}\n` +
          `recommendation: ${finding.recommendation}`
      )
      .join("\n\n");
    const sections = audit.sections
      .map((section) => `--- ${section.name} ---\n${section.body}`)
      .join("\n\n")
      .slice(0, 6000);
    onAskAi(
      `请解释这次只读安全审计的发现，并按风险排序给出修复步骤。不要自动执行命令。\n\n` +
        `FINDINGS:\n${findings}\n\nRAW SECTIONS:\n${sections}`
    );
    onClose();
  };

  if (!open) return null;

  const high = audit?.findings.filter((item) => item.severity === "high").length ?? 0;
  const medium =
    audit?.findings.filter((item) => item.severity === "medium").length ?? 0;

  return (
    <aside
      className="ai-drawer sec-drawer"
      id="security-audit"
      aria-label={t("Security audit")}
    >
      <div className="ai-drawer__scan" aria-hidden />
      <header className="ai-drawer__head">
        <div className="ai-drawer__title">
          <span className="ai-drawer__spark" aria-hidden>
            ◈
          </span>
          <div>
            <p>{t("SEC // AUDIT")}</p>
            <span>{t("read-only · fixed command allowlist")}</span>
          </div>
        </div>
        <div className="ai-drawer__actions">
          <button
            className="ai-iconbtn"
            type="button"
            onClick={() => void run()}
            disabled={busy || !canScan}
            title={t("Run read-only audit")}
            aria-label={t("Run read-only audit")}
          >
            ↻
          </button>
          <button
            className="ai-iconbtn ai-iconbtn--close"
            type="button"
            onClick={onClose}
            title={t("Close security panel")}
            aria-label={t("Close security panel")}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="ai-drawer__body sec-body">
        <p className="sec-scope">
          {t("Read-only checks for SSH config, listeners/firewall, patches, failed logins/fail2ban and SSH directory permissions. No third-party IP scanning and no password attempts.")}
        </p>

        {!canScan ? (
          <p className="sec-empty">{t("Connect SSH before running a remote security audit.")}</p>
        ) : null}

        <div className="sec-runrow">
          <button
            className="sec-run"
            type="button"
            onClick={() => void run()}
            disabled={busy || !canScan}
          >
            {busy ? t("auditing…") : audit ? t("re-run audit") : t("run audit")}
          </button>
          {audit ? (
            <button className="sec-ai" type="button" onClick={askAi}>
              {t("ask AI")}
            </button>
          ) : null}
        </div>

        {error ? <p className="sec-error">{error}</p> : null}

        {audit ? (
          <>
            <div className="sec-summary">
              <span className="sec-pill sec-pill--high">{high} {t("high")}</span>
              <span className="sec-pill sec-pill--medium">{medium} {t("medium")}</span>
              <span className="sec-pill">
                {t("{count} findings", { count: audit.findings.length })}
              </span>
            </div>

            <div className="sec-findings">
              {audit.findings.map((finding) => (
                <article
                  className={`sec-finding sec-finding--${finding.severity}`}
                  key={finding.id}
                >
                  <header>
                    <span className="sec-sev">
                      {severityLabel[finding.severity] ?? finding.severity}
                    </span>
                    <b>{finding.title}</b>
                  </header>
                  <p>{finding.detail}</p>
                  <p className="sec-fix">→ {finding.recommendation}</p>
                </article>
              ))}
            </div>

            <div className="sec-sections">
              {audit.sections.map((section) => (
                <details key={section.name}>
                  <summary>
                    {section.name.toLowerCase().replace(/_/g, " ")}
                  </summary>
                  <pre>{section.body}</pre>
                </details>
              ))}
            </div>
          </>
        ) : !busy && canScan ? (
          <div className="sec-empty">
            <pre aria-hidden>{`  ┌────────────────────┐
  │  NO AUDIT YET      │
  │  ready when you are│
  └────────────────────┘`}</pre>
            <p>{t("Click run audit to perform a read-only check.")}</p>
          </div>
        ) : null}

        {busy ? (
          <div className="ai-thinking">
            <span />
            <span />
            <span />
            {t("collecting")}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
