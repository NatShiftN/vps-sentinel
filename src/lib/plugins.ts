export type SnippetItem = {
  id: string;
  name: string;
  description: string;
  command: string;
  tags: string[];
};

export type PromptItem = {
  id: string;
  name: string;
  description: string;
  prompt: string;
};

export type ProviderItem = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  model: string;
};

export type PluginKind = "snippets" | "ai";

export type Plugin = {
  schema: 1;
  kind: PluginKind;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  snippets?: SnippetItem[];
  prompts?: PromptItem[];
  providers?: ProviderItem[];
  builtin?: boolean;
};

export type PluginState = {
  custom: Plugin[];
  disabled: string[];
};

export const PLUGIN_STORAGE_KEY = "sentinel.plugins.v1";

export const BUILTIN_PLUGINS: Plugin[] = [
  {
    schema: 1,
    kind: "snippets",
    id: "linux-triage",
    name: "Linux Triage",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Read-only Linux diagnostics you can insert into the terminal.",
    builtin: true,
    snippets: [
      {
        id: "uptime",
        name: "Uptime and load",
        description: "Show how long the host has been up and its load averages.",
        command: "uptime",
        tags: ["health", "load"],
      },
      {
        id: "failed-units",
        name: "Failed systemd units",
        description: "List failed services without opening a pager.",
        command: "systemctl --failed --no-pager",
        tags: ["systemd"],
      },
      {
        id: "journal-errors",
        name: "Recent priority-3 journal",
        description: "Last 80 error-or-worse journal lines.",
        command: "journalctl -p 3 -xb --no-pager | tail -n 80",
        tags: ["logs"],
      },
      {
        id: "disk",
        name: "Filesystem usage",
        description: "Show type, size, used and mount point for filesystems.",
        command: "df -hT",
        tags: ["disk"],
      },
      {
        id: "ports",
        name: "Listening ports",
        description: "List TCP/UDP listeners with owning processes when permitted.",
        command: "ss -tulpn",
        tags: ["network"],
      },
      {
        id: "top-mem",
        name: "Top memory processes",
        description: "First 15 processes by resident memory.",
        command: "ps aux --sort=-%mem | head -n 15",
        tags: ["memory"],
      },
    ],
  },
  {
    schema: 1,
    kind: "snippets",
    id: "container-ops",
    name: "Container Ops",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Read-only Docker inspection commands.",
    builtin: true,
    snippets: [
      {
        id: "docker-ps",
        name: "Docker containers",
        description: "Show running containers and their status.",
        command: "docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'",
        tags: ["docker"],
      },
      {
        id: "docker-stats",
        name: "Docker live stats (one shot)",
        description: "Single non-streaming resource snapshot.",
        command: "docker stats --no-stream",
        tags: ["docker", "resources"],
      },
      {
        id: "compose-ps",
        name: "Compose services",
        description: "List services for the compose project in the current directory.",
        command: "docker compose ps",
        tags: ["docker", "compose"],
      },
    ],
  },
  {
    schema: 1,
    kind: "ai",
    id: "ops-prompts",
    name: "Ops Prompt Pack",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Practical prompts for incident triage and safe changes.",
    builtin: true,
    prompts: [
      {
        id: "explain-last-error",
        name: "Explain the last error",
        description: "Turn the selected/last terminal error into a diagnosis plan.",
        prompt:
          "Explain the last error in the attached terminal context. Identify the most likely cause, list the evidence you used, and propose a safe verification step before any change.",
      },
      {
        id: "high-load",
        name: "Diagnose high load",
        description: "Investigate load average, CPU and memory pressure.",
        prompt:
          "Diagnose the current load on this host using the attached telemetry. Separate CPU, memory, disk I/O and runaway-process hypotheses, and give read-only commands to confirm each one.",
      },
      {
        id: "security-review",
        name: "Review security findings",
        description: "Prioritize read-only audit findings without auto-remediation.",
        prompt:
          "Review the attached security audit findings. Prioritize by practical exposure, explain the risk in plain language, and propose read-only verification plus a manual remediation plan. Do not suggest automated exploitation or credential attacks.",
      },
      {
        id: "safe-systemd",
        name: "Draft a safe systemd unit",
        description: "Generate a minimal hardened unit and explain each directive.",
        prompt:
          "Draft a minimal systemd service unit for the task I describe. Prefer hardening directives, explain each one, and call out anything that needs manual validation before enabling it.",
      },
    ],
  },
  {
    schema: 1,
    kind: "ai",
    id: "ai-endpoints",
    name: "OpenAI-compatible endpoints",
    version: "1.0.0",
    author: "VPS//SENTINEL",
    description: "Endpoint/model presets; API keys remain in AI settings.",
    builtin: true,
    providers: [
      {
        id: "openai",
        name: "OpenAI",
        description: "Official OpenAI Chat Completions endpoint.",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        description: "DeepSeek OpenAI-compatible endpoint.",
        baseUrl: "https://api.deepseek.com/chat/completions",
        model: "deepseek-chat",
      },
      {
        id: "ollama",
        name: "Ollama (local)",
        description: "Local Ollama OpenAI-compatible endpoint.",
        baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
        model: "llama3.1",
      },
    ],
  },
];

const ID = /^[a-z0-9][a-z0-9-]{2,48}$/;
const HEX_NOT_NEEDED = true;
void HEX_NOT_NEEDED;

const isString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const isControlFree = (value: string) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);

const validateSnippet = (value: unknown): SnippetItem => {
  if (!value || typeof value !== "object") throw new Error("Invalid snippet.");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["id", "name", "description", "command", "tags"].includes(key)) {
      throw new Error(`Snippet field "${key}" is not allowed.`);
    }
  }
  if (!isString(raw.id, 48) || !ID.test(raw.id)) {
    throw new Error("Snippet id must be a lowercase slug.");
  }
  if (!isString(raw.name, 80)) throw new Error("Snippet name is invalid.");
  if (!isString(raw.description, 300)) {
    throw new Error("Snippet description is invalid.");
  }
  if (!isString(raw.command, 500) || /[\r\n]/.test(raw.command)) {
    throw new Error("Snippet command must be one line, max 500 chars.");
  }
  if (!isControlFree(raw.command)) {
    throw new Error("Snippet command contains control characters.");
  }
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : [];
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    command: raw.command,
    tags,
  };
};

const validatePrompt = (value: unknown): PromptItem => {
  if (!value || typeof value !== "object") throw new Error("Invalid prompt.");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["id", "name", "description", "prompt"].includes(key)) {
      throw new Error(`Prompt field "${key}" is not allowed.`);
    }
  }
  if (!isString(raw.id, 48) || !ID.test(raw.id)) {
    throw new Error("Prompt id must be a lowercase slug.");
  }
  if (!isString(raw.name, 80)) throw new Error("Prompt name is invalid.");
  if (!isString(raw.description, 300)) {
    throw new Error("Prompt description is invalid.");
  }
  if (!isString(raw.prompt, 4000) || !isControlFree(raw.prompt)) {
    throw new Error("Prompt must be at most 4000 chars and control-free.");
  }
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    prompt: raw.prompt,
  };
};

const validateProvider = (value: unknown): ProviderItem => {
  if (!value || typeof value !== "object") throw new Error("Invalid provider.");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["id", "name", "description", "baseUrl", "model"].includes(key)) {
      throw new Error(`Provider field "${key}" is not allowed.`);
    }
  }
  if (!isString(raw.id, 48) || !ID.test(raw.id)) {
    throw new Error("Provider id must be a lowercase slug.");
  }
  if (!isString(raw.name, 80)) throw new Error("Provider name is invalid.");
  if (!isString(raw.description, 300)) {
    throw new Error("Provider description is invalid.");
  }
  if (!isString(raw.baseUrl, 500)) {
    throw new Error("Provider baseUrl is invalid.");
  }
  let url: URL;
  try {
    url = new URL(raw.baseUrl);
  } catch {
    throw new Error("Provider baseUrl must be a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Provider baseUrl must be http(s).");
  }
  if (!isString(raw.model, 100)) throw new Error("Provider model is invalid.");
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    baseUrl: raw.baseUrl,
    model: raw.model,
  };
};

export const validatePlugin = (value: unknown): Plugin => {
  if (!value || typeof value !== "object") {
    throw new Error("Plugin manifest must be a JSON object.");
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    "schema",
    "kind",
    "id",
    "name",
    "version",
    "author",
    "description",
    "snippets",
    "prompts",
    "providers",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new Error(`Plugin field "${key}" is not allowed.`);
    }
  }
  if (raw.schema !== 1) throw new Error("Plugin schema must be 1.");
  if (raw.kind !== "snippets" && raw.kind !== "ai") {
    throw new Error('Plugin kind must be "snippets" or "ai".');
  }
  if (!isString(raw.id, 48) || !ID.test(raw.id)) {
    throw new Error("Plugin id must be a lowercase slug.");
  }
  if (!isString(raw.name, 80)) throw new Error("Plugin name is invalid.");
  if (!isString(raw.version, 32)) throw new Error("Plugin version is invalid.");
  if (!isString(raw.author, 80)) throw new Error("Plugin author is invalid.");
  if (!isString(raw.description, 300)) {
    throw new Error("Plugin description is invalid.");
  }

  const snippets = Array.isArray(raw.snippets)
    ? raw.snippets.slice(0, 50).map(validateSnippet)
    : [];
  const prompts = Array.isArray(raw.prompts)
    ? raw.prompts.slice(0, 50).map(validatePrompt)
    : [];
  const providers = Array.isArray(raw.providers)
    ? raw.providers.slice(0, 24).map(validateProvider)
    : [];

  if (raw.kind === "snippets" && snippets.length === 0) {
    throw new Error("A snippets plugin needs at least one snippet.");
  }
  if (raw.kind === "ai" && prompts.length + providers.length === 0) {
    throw new Error("An AI plugin needs prompts or providers.");
  }
  if (raw.kind === "snippets" && (prompts.length || providers.length)) {
    throw new Error("A snippets plugin cannot contain AI items.");
  }
  if (raw.kind === "ai" && snippets.length) {
    throw new Error("An AI plugin cannot contain terminal snippets.");
  }
  const ids = [...snippets, ...prompts, ...providers].map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Plugin item ids must be unique.");
  }

  return {
    schema: 1,
    kind: raw.kind,
    id: raw.id,
    name: raw.name,
    version: raw.version,
    author: raw.author,
    description: raw.description,
    ...(snippets.length ? { snippets } : {}),
    ...(prompts.length ? { prompts } : {}),
    ...(providers.length ? { providers } : {}),
  };
};

export const allPlugins = (custom: Plugin[]) => [
  ...BUILTIN_PLUGINS,
  ...custom,
];

export const loadPluginState = (): PluginState => {
  try {
    const raw = window.localStorage.getItem(PLUGIN_STORAGE_KEY);
    if (!raw) return { custom: [], disabled: [] };
    const parsed = JSON.parse(raw) as {
      custom?: unknown;
      disabled?: unknown;
    };
    const custom: Plugin[] = [];
    if (Array.isArray(parsed.custom)) {
      for (const entry of parsed.custom.slice(0, 24)) {
        try {
          const plugin = validatePlugin(entry);
          if (!BUILTIN_PLUGINS.some((builtin) => builtin.id === plugin.id)) {
            custom.push(plugin);
          }
        } catch {
          // Drop malformed plugins.
        }
      }
    }
    const disabled = Array.isArray(parsed.disabled)
      ? parsed.disabled
          .filter((id): id is string => typeof id === "string")
          .slice(0, 64)
      : [];
    return { custom, disabled };
  } catch {
    return { custom: [], disabled: [] };
  }
};

export const savePluginState = (state: PluginState) => {
  try {
    window.localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Plugin state persistence is best-effort.
  }
};
