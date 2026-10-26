import type { SshAuthMethod, SshTarget } from "../hooks/useSshSession";

export type HostProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath: string;
  group: string;
  autoReconnect: boolean;
};

export const HOSTS_STORAGE_KEY = "sentinel.hosts.v1";

const AUTH_METHODS: SshAuthMethod[] = ["password", "key", "agent"];

const isProfile = (value: unknown): value is HostProfile => {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<HostProfile>;
  return (
    typeof raw.id === "string" &&
    typeof raw.name === "string" &&
    typeof raw.host === "string" &&
    typeof raw.username === "string" &&
    typeof raw.port === "number" &&
    Number.isInteger(raw.port) &&
    raw.port > 0 &&
    raw.port <= 65535 &&
    typeof raw.authMethod === "string" &&
    AUTH_METHODS.includes(raw.authMethod as SshAuthMethod) &&
    typeof raw.privateKeyPath === "string" &&
    (typeof raw.group === "string" || raw.group === undefined) &&
    typeof raw.autoReconnect === "boolean"
  );
};

export const loadHosts = (): HostProfile[] => {
  try {
    const raw = window.localStorage.getItem(HOSTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isProfile)
      .slice(0, 100)
      .map((host) => ({ ...host, group: host.group ?? "" }));
  } catch {
    return [];
  }
};

export const saveHosts = (hosts: HostProfile[]) => {
  try {
    window.localStorage.setItem(HOSTS_STORAGE_KEY, JSON.stringify(hosts.slice(0, 100)));
  } catch {
    // Host persistence is best-effort.
  }
};

export const hostToTarget = (host: HostProfile): SshTarget => ({
  host: host.host,
  port: host.port,
  username: host.username,
  authMethod: host.authMethod,
  privateKeyPath: host.privateKeyPath,
  autoReconnect: host.autoReconnect,
});

export const makeHostId = () =>
  `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;


export type SshConfigHost = {
  name: string;
  host: string;
  port: number;
  username: string;
  identityFile: string;
  proxyJump: string;
};
