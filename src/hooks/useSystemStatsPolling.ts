import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../lib/tauri";

export type DiskStat = {
  mount: string;
  total: number;
  used: number;
  percent: number;
};

/** Shape returned by the Rust `get_sys_stats` command (bytes / bytes per second). */
export type SysStats = {
  cpuUsage: number;
  cpuBrand: string;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  netRxRate: number;
  netTxRate: number;
  disks: DiskStat[];
  uptime: number;
  hostname: string;
};

const POLL_INTERVAL_MS = 1000;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${
    units[exponent]
  }`;
};

/** Direct access to the backend command, handy outside the polling hook. */
export async function fetchSysStats(): Promise<SysStats> {
  return invoke<SysStats>("get_sys_stats");
}

/**
 * Calls `get_sys_stats` once per second. Real CPU, memory, network rates,
 * disks and uptime are handed to `onStats`; console output is dev-only.
 * In a plain browser the poller stays idle so the Mock UI keeps working.
 */
export function useSystemStatsPolling(
  intervalMs = POLL_INTERVAL_MS,
  onStats?: (stats: SysStats) => void
) {
  const statsRef = useRef(onStats);

  useEffect(() => {
    statsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      console.info(
        "[sys] Tauri runtime not detected — `get_sys_stats` polling is idle."
      );
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const stats = await fetchSysStats();
        if (cancelled) return;

        statsRef.current?.(stats);

        if (import.meta.env.DEV) {
          const memPct =
            stats.memoryTotal > 0
              ? (stats.memoryUsed / stats.memoryTotal) * 100
              : 0;
          console.log(
            `[sys] CPU ${stats.cpuUsage.toFixed(1)}% · MEM ${formatBytes(
              stats.memoryUsed
            )} / ${formatBytes(stats.memoryTotal)} (${memPct.toFixed(
              1
            )}%) · NET ↓ ${formatBytes(stats.netRxRate)}/s ↑ ${formatBytes(
              stats.netTxRate
            )}/s · disks ${stats.disks.length}`,
            stats
          );
        }
      } catch (error) {
        console.error("[sys] get_sys_stats failed:", error);
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}
