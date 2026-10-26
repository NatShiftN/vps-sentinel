import { describe, expect, it } from "vitest";
import { formatGb, formatRate, formatUptime } from "./format";

describe("formatUptime", () => {
  it("handles missing telemetry", () => {
    expect(formatUptime(0)).toBe("—");
    expect(formatUptime(Number.NaN)).toBe("—");
  });

  it("formats hours and minutes", () => {
    expect(formatUptime(3660)).toBe("1h 01m");
  });

  it("formats days", () => {
    expect(formatUptime(90000)).toBe("1d 01h");
  });
});

describe("formatGb", () => {
  it("converts bytes to GiB", () => {
    expect(formatGb(1024 ** 3)).toBe("1.0");
    expect(formatGb(8 * 1024 ** 3)).toBe("8.0");
  });
});

describe("formatRate", () => {
  it("formats MiB per second", () => {
    expect(formatRate(1024 * 1024)).toBe("1.0 MB/s");
  });
});
