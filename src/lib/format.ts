export const formatUptime = (totalSeconds: number) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return days > 0
    ? `${days}d ${String(hours).padStart(2, "0")}h`
    : `${hours}h ${String(minutes).padStart(2, "0")}m`;
};

export const formatGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

export const formatRate = (bytesPerSecond: number) =>
  `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
