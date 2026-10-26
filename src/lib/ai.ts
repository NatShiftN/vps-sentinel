export type AiBlock =
  | { type: "text"; text: string }
  | { type: "code"; lang: string; code: string };

export type AiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const SHELL_LANGS = new Set([
  "",
  "bash",
  "sh",
  "shell",
  "zsh",
  "fish",
  "console",
  "powershell",
  "ps1",
]);

export const isShellLanguage = (lang: string): boolean =>
  SHELL_LANGS.has(lang.toLowerCase());

/**
 * Minimal fenced-code parser. Text is rendered verbatim (React escapes it),
 * while fenced shell blocks get an insert-terminal action.
 */
export const parseAiBlocks = (content: string): AiBlock[] => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: AiBlock[] = [];
  let text: string[] = [];

  const flushText = () => {
    if (text.length === 0) return;
    const value = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (value) blocks.push({ type: "text", text: value });
    text = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (!fence) {
      text.push(line);
      continue;
    }

    flushText();
    const lang = fence[1].toLowerCase();
    const code: string[] = [];
    index += 1;
    while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
      code.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "code", lang, code: code.join("\n").trimEnd() });
  }

  flushText();
  return blocks;
};

/**
 * Remove terminal control bytes from model output before writing to a PTY.
 * Tabs/newlines stay; ESC/CSI and other C0 controls are stripped.
 */
export const sanitizeShellCommand = (command: string): string =>
  command
    .replace(/\r/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n+$/, "")
    .slice(0, 8000);

/** Keep the newest non-error turns for the model, oldest-first. */
export const buildConversationHistory = (
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    content: string;
    error?: boolean;
    transient?: boolean;
  }>,
  maxMessages = 12
): AiHistoryMessage[] =>
  messages
    .filter((message) => !message.error && !message.transient)
    .slice(-maxMessages)
    .map(({ role, content }) => ({ role, content }));
