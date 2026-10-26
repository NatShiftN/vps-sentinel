import { describe, expect, it } from "vitest";
import {
  buildConversationHistory,
  parseAiBlocks,
  sanitizeShellCommand,
} from "./ai";

describe("parseAiBlocks", () => {
  it("splits text and fenced shell blocks", () => {
    const blocks = parseAiBlocks(
      "Check this:\n\n```bash\nwhoami\n```\n\nThen `id`."
    );
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: "text", text: "Check this:" });
    expect(blocks[1]).toEqual({ type: "code", lang: "bash", code: "whoami" });
    expect(blocks[2]).toMatchObject({ type: "text" });
  });

  it("keeps an unclosed fence as a code block", () => {
    const blocks = parseAiBlocks("```sh\necho hi");
    expect(blocks).toEqual([{ type: "code", lang: "sh", code: "echo hi" }]);
  });

  it("preserves plain text with no fence", () => {
    expect(parseAiBlocks("hello\nworld")).toEqual([
      { type: "text", text: "hello\nworld" },
    ]);
  });
});

describe("sanitizeShellCommand", () => {
  it("strips terminal escape bytes but keeps tabs and newlines", () => {
    const input = "echo ok\x1b[31m\ntab\tend\r\n\n";
    expect(sanitizeShellCommand(input)).toBe("echo ok\ntab\tend");
  });

  it("trims only trailing newlines", () => {
    expect(sanitizeShellCommand("\nwhoami\n\n")).toBe("\nwhoami");
  });
});

describe("buildConversationHistory", () => {
  it("drops errors, keeps order, and limits length", () => {
    const history = buildConversationHistory(
      [
        { role: "user", content: "one" },
        { role: "assistant", content: "failed", error: true },
        { role: "assistant", content: "answer" },
      ],
      1
    );
    expect(history).toEqual([
      { role: "assistant", content: "answer" },
    ]);
  });

  it("drops cancelled transient turns", () => {
    const history = buildConversationHistory([
      { role: "user", content: "keep" },
      { role: "user", content: "cancelled", transient: true },
      { role: "assistant", content: "请求已取消。", transient: true },
    ]);
    expect(history).toEqual([{ role: "user", content: "keep" }]);
  });
});
