import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "zh-CN";

const LANGUAGE_KEY = "sentinel.language.v1";

const detectLanguage = (): Language => {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    if (saved === "en" || saved === "zh-CN") return saved;
  } catch {
    // ignore
  }
  const browser = navigator.language.toLowerCase();
  return browser.startsWith("zh") ? "zh-CN" : "en";
};

const zh: Record<string, string> = {
  // shell
  "remote operations console": "远程运维控制台",
  "connection readouts": "连接状态读数",
  "local host": "本机",
  "core telemetry": "核心遥测",
  "network throughput": "网络吞吐",
  "storage array": "存储阵列",
  "link session": "链路会话",
  "awaiting disk telemetry…": "等待磁盘遥测…",
  "host key": "主机密钥",
  "remote load": "远端负载",
  "remote mem": "远端内存",
  "remote disk": "远端磁盘",
  "remote kernel": "远端内核",
  "remote metrics": "远端指标",
  "all interfaces": "全部接口",
  "1s sample": "1 秒采样",
  "peak {value} MB/s": "峰值 {value} MB/s",
  "probing…": "探测中…",
  "ssh link active": "SSH 链路已连接",
  "ssh handshake": "SSH 握手中",
  "ssh link down": "SSH 链路断开",
  "ssh link idle": "SSH 链路空闲",
  "ssh reconnect {attempt}/3": "SSH 重连 {attempt}/3",
  "ssh terminal": "SSH 终端",
  "new link": "新链路",
  "handshaking…": "握手中…",
  "new tab": "新标签",
  "new window": "新窗口",
  "close {name}": "关闭 {name}",
  "system telemetry": "系统遥测",
  "Plugin hub": "插件中心",
  "Session history": "会话历史",
  "Plugin hub (Ctrl+Shift+P)": "插件中心 (Ctrl+Shift+P)",
  "Session history (Ctrl+Shift+H)": "会话历史 (Ctrl+Shift+H)",
  "Settings (Ctrl+,)": "设置 (Ctrl+,)",
  "sentinel v0.9.4": "哨兵 v0.9.4",
  restore: "还原",
  "by Mr.N": "作者 Mr.N",
  "Screen saver": "屏幕保护",
  "split view": "分屏",
  "close split view": "关闭分屏",

  "broadcast input to all sessions": "把输入广播到所有会话",

  "ssh keys": "SSH 密钥",
  "Keys live in ~/.ssh; private key contents are never read by the UI.":
    "密钥保存在 ~/.ssh；界面不会读取私钥内容。",
  "new key name": "新密钥名称",
  "generate ed25519": "生成 Ed25519",
  "open ~/.ssh": "打开 ~/.ssh",
  "no ssh keys": "没有 SSH 密钥",
  "copy public key": "复制公钥",
  "Generated {name}.": "已生成 {name}。",
  "Deleted {name}.": "已删除 {name}。",
  "Delete key {name}? This cannot be undone.": "删除密钥 {name}？此操作不可撤销。",

  "No output available for replay.": "没有可用于回放的输出。",
  replay: "回放",
  "session replay": "会话回放",
  pause: "暂停",
  play: "播放",
  "starting replay…": "开始回放…",
  finished: "已完成",
  replaying: "回放中",

  "find in terminal": "在终端中查找",
  "previous match": "上一个",
  "next match": "下一个",
  "no matches": "没有匹配",
  "close search": "关闭搜索",

  "Host manager": "主机管理",
  "OpenSSH X11/agent session": "OpenSSH X11/agent 会话",

  "import ssh config": "导入 ssh config",
  "No Host entries found in ~/.ssh/config.": "~/.ssh/config 中没有 Host 条目。",
  "Imported {count} hosts; ProxyJump entries need manual setup.":
    "已导入 {count} 个主机；ProxyJump 条目需要手动配置。",

  "HOST MANAGER": "主机管理",
  "saved connections · no passwords stored": "已保存连接 · 不保存密码",
  "filter hosts": "筛选主机",
  "new host": "新建主机",
  "use current": "使用当前连接",
  "no saved hosts": "没有已保存主机",
  "Host is required.": "主机地址必填。",
  "Username is required.": "用户名必填。",
  "Port must be 1-65535.": "端口必须为 1-65535。",
  "Private key path is required for key auth.": "密钥认证必须填写私钥路径。",
  "Delete host {name}?": "删除主机 {name}？",
  "add host": "添加主机",
  "edit host": "编辑主机",
  edit: "编辑",
  name: "名称",
  group: "分组",
  authentication: "认证方式",
  "auto reconnect": "自动重连",
  "save host": "保存主机",
  "save changes": "保存修改",
  clear: "清空",

  "ssh monitor": "SSH 监控",
  healthy: "健康",
  degraded: "降级",
  lost: "已断开",
  handshake: "握手中",
  latency: "延迟",
  session: "会话时长",
  traffic: "流量",
  keepalive: "保活",
  reconnects: "重连",
  unreachable: "不可达",
  "latency history": "延迟历史",

  "screen protected": "屏幕已保护",
  "click or press any key to return": "点击或按任意键返回",

  "Created by Mr.N": "由 Mr.N 制作",
  "close window": "关闭窗口",


  // terminal pane
  "AI assistant": "AI 助手",
  "Read-only security audit": "只读安全审计",
  "SFTP file browser (active tab)": "SFTP 文件浏览（当前标签）",
  "Local port forwarding (active tab)": "本地端口转发（当前标签）",
  "NO ACTIVE SSH SESSION": "没有活动的 SSH 会话",
  "open a connection to begin": "连接后开始",
  "connect": "连接",
  "disconnect": "断开",
  "reconnect": "重连",
  "cancel": "取消",
  "close": "关闭",
  "minimise": "最小化",
  "maximise": "最大化",
  "close tab": "关闭标签",
  "tab complete": "Tab 补全",
  "link down": "链路断开",
  "link active": "链路已连接",
  "terminal input": "终端输入",
  "session closed — press connect to open a new link": "会话已关闭 — 按连接打开新链路",
  "session error": "会话错误",
  "restored target {target} — reconnect to resume": "已恢复目标 {target} — 重新连接以继续",
  "open a connection in this tab, or use another tab/window": "在此标签打开连接，或使用其他标签/窗口",
  "connect this tab": "连接此标签",
  "xterm · ctrl+shift+c/v copy & paste · ctrl+i explain selection": "xterm · Ctrl+Shift+C/V 复制粘贴 · Ctrl+I 解释选中内容",
  "no session · press connect": "没有会话 · 按连接",


  // connection dialog
  "secure shell · outbound": "安全 Shell · 出站",
  "ESTABLISH LINK": "建立链路",
  "close dialog": "关闭对话框",
  "host key verification · pty xterm-256color · auto resize":
    "主机密钥校验 · PTY xterm-256color · 自动调整",
  "authentication method": "认证方式",
  "private key": "私钥",
  "ssh-agent": "ssh-agent",
  "key passphrase (optional)": "密钥口令（可选）",
  "使用当前用户的 ssh-agent（SSH_AUTH_SOCK / Windows OpenSSH Authentication Agent）。不会读取私钥文件。":
    "使用当前用户的 ssh-agent（SSH_AUTH_SOCK / Windows OpenSSH Authentication Agent）。不会读取私钥文件。",
  "connect through jump host (password auth · jump key must already be trusted)":
    "通过跳板机连接（密码认证 · 跳板密钥必须已信任）",
  "jump host": "跳板机",
  "jump user": "跳板用户",
  "jump port": "跳板端口",
  "jump password": "跳板密码",
  "auto-reconnect with backoff (3 tries · keeps credentials in memory)":
    "自动重连（退避 3 次 · 凭据仅保存在内存）",

  "Use the current user's ssh-agent (SSH_AUTH_SOCK / Windows OpenSSH Authentication Agent). Private key files are not read.":
    "使用当前用户的 ssh-agent（SSH_AUTH_SOCK / Windows OpenSSH Authentication Agent）。不会读取私钥文件。",
  "replace key & connect": "替换密钥并连接",
  "trust & connect": "信任并连接",
  "connecting…": "连接中…",
  "host key changed": "主机密钥已变化",
  "unknown host key": "未知主机密钥",
  "compare this fingerprint with the server operator out of band before trusting it.":
    "信任前请通过带外方式与服务器管理员核对此指纹。",
  "keys are pinned in the app config directory": "密钥固定保存在应用配置目录",
  "establish link": "建立链路",
  "probing host key…": "正在探测主机密钥…",
  "trust and connect": "信任并连接",
  "cancelling…": "取消中…",
  "auth failed": "认证失败",

  // settings
  "settings": "设置",
  "appearance · connection · modules · data": "外观 · 连接 · 模块 · 数据",
  "Application settings": "应用设置",
  "Interface language": "界面语言",
  "English": "English",
  "简体中文": "简体中文",


  "Forget host key for {host}?": "忘记 {host} 的主机密钥？",
  "removed {name}": "已移除 {name}",
  "Clear the saved AI conversation for this window?": "清空此窗口保存的 AI 对话？",
  "AI conversation cleared": "AI 对话已清空",
  "Could not clear stored AI conversation.": "无法清空已保存的 AI 对话。",
  "Reset all app settings to defaults?": "把全部应用设置重置为默认值？",
  "Theme manifest must be smaller than 16 KB.": "主题清单必须小于 16 KB。",
  "installed {name}": "已安装 {name}",
  "Remove theme {name}?": "移除主题 {name}？",
  "OpenAI-compatible chat, context injection and terminal insert": "OpenAI 兼容聊天、上下文注入和终端插入",
  "Browse, download, upload, rename, mkdir and delete": "浏览、下载、上传、重命名、新建目录和删除",
  "127.0.0.1 listener → remote TCP destination": "127.0.0.1 监听 → 远端 TCP 目标",
  "Read-only remote checks and findings": "只读远程检查和发现",
  "English / 简体中文 · saved per profile": "English / 简体中文 · 按配置保存",
  "subtle scanline + vignette overlay": "轻微扫描线 + 暗角叠加",
  "disable animations and transitions": "关闭动画和过渡",
  "new connection dialogs start with this checked": "新连接对话框默认勾选",
  "open AI settings": "打开 AI 设置",
  "These modules are compiled into the app and can be enabled or disabled here. External plugin downloads are not connected yet: a real marketplace needs a plugin API, sandbox, signatures and an update channel.":
    "这些模块已编译进应用，可在此启用或禁用。外部插件下载尚未接入：真正的市场需要插件 API、沙箱、签名和更新通道。",
  "Base URL, model and key live in the AI drawer settings (keychain / config fallback).":
    "Base URL、模型和密钥在 AI 抽屉设置中（keychain / 配置文件回退）。",
  "Delete all stored session history? This cannot be undone.":
    "删除全部已存储的会话历史？此操作不可撤销。",
  "resolving app config directory…": "正在解析应用配置目录…",
  "theme market · local": "主题市场 · 本地",
  "Declarative themes only: colours and layout values, no JavaScript, HTML or raw CSS. Import is validated and capped at 16 KB.":
    "仅支持声明式主题：颜色和布局值，不含 JavaScript、HTML 或原始 CSS。导入会校验并限制 16 KB。",
  "built-in": "内置",
  "import theme .json": "导入主题 .json",
  "CRT scanlines": "CRT 扫描线",
  "Reduce motion": "减少动效",
  "Terminal font size": "终端字号",
  "connection defaults": "连接默认值",
  "default username": "默认用户名",
  "default port": "默认端口",
  "Auto-reconnect by default": "默认自动重连",
  "module market · built-in": "模块市场 · 内置",
  "AI copilot": "AI 助手",
  "Terminal command suggestions, error explanation and context-aware help.":
    "终端命令建议、错误解释和上下文辅助。",
  "SFTP browser": "SFTP 浏览器",
  "Remote file browser with chunked upload and download.":
    "远程文件浏览，支持分块上传和下载。",
  "Local port forward": "本地端口转发",
  "Expose a remote service on a local loopback port.":
    "把远端服务映射到本地回环端口。",
  "Security audit": "安全审计",
  "Read-only checks for SSH, firewall, updates and exposed services.":
    "对 SSH、防火墙、更新和暴露服务做只读检查。",
  "ai provider": "AI 提供方",
  "Configure in AI panel": "在 AI 面板中配置",
  "session history": "会话历史",
  "Record terminal output": "记录终端输出",
  "SQLite history; up to 8 MB per session. Output may contain secrets or sensitive logs.":
    "SQLite 历史；每个会话最多 8 MB。输出可能包含密钥或敏感日志。",
  "Capture typed commands": "捕获输入命令",
  "Off by default. May capture passwords typed at sudo/password prompts. Only enable on trusted hosts.":
    "默认关闭。可能捕获在 sudo/密码提示处输入的密码。仅在可信主机开启。",
  "Older sessions are pruned on startup/config change.":
    "启动或修改配置时会清理更早的会话。",
  "refresh stats": "刷新统计",
  "clear history": "清空历史",
  "history stats unavailable": "历史统计不可用",
  "known hosts": "已知主机",
  "no trusted host keys": "没有已信任的主机密钥",
  "open config folder": "打开配置目录",
  "forget": "忘记",
  "forget {host}?": "忘记 {host}？",
  "Clear AI conversation": "清空 AI 对话",
  "Reset settings": "重置设置",
  "reset all settings?": "重置全部设置？",
  "VPS//SENTINEL 0.1.0 · Tauri 2 · React 18": "VPS//SENTINEL 0.1.0 · Tauri 2 · React 18",
  "Windows portable build · no installer": "Windows 便携版 · 无需安装",
  "keys pinned": "已固定密钥",
  "close settings": "关闭设置",
  "refreshing…": "刷新中…",
  "settings reset": "设置已重置",
  "history cleared": "历史已清空",
  "theme installed": "主题已安装",
  "theme removed": "主题已移除",
  "theme applied": "主题已应用",
  "import failed": "导入失败",
  "no active forwards": "没有活动的转发",

  // plugins

  "inserted into the active terminal — not executed": "已插入当前终端 — 未执行",
  "prompt loaded into AI": "提示词已载入 AI",
  "snippets · prompts · provider presets · local JSON": "命令片段 · 提示词 · 提供方预设 · 本地 JSON",
  "Large built-in word list": "内置词库",
  "PLUGIN HUB": "插件中心",
  "Insert only — commands are not executed automatically. Review before pressing Enter.":
    "仅插入 — 命令不会自动执行。按 Enter 前请检查。",
  "No enabled snippet plugins.": "没有启用的命令片段插件。",
  "Loads a prompt into the AI composer; review before sending.":
    "把提示词填入 AI 输入框；发送前请检查。",
  "No enabled prompt plugins.": "没有启用的提示词插件。",
  "AI module is disabled in Settings.": "AI 模块已在设置中禁用。",
  "Applies base URL and model only. API keys stay in AI settings and are never stored in plugins.":
    "只应用 Base URL 和模型。API Key 保存在 AI 设置中，不会写入插件。",
  "No enabled provider plugins.": "没有启用的提供方插件。",
  "Safe declarative plugins only: snippets, prompts and endpoint presets. No JavaScript, HTML, CSS or executable code.":
    "仅支持安全的声明式插件：命令片段、提示词和端点预设。不含 JavaScript、HTML、CSS 或可执行代码。",
  "import plugin .json": "导入插件 .json",
  "applied {name}; reopen AI settings to see the new endpoint":
    "已应用 {name}；重新打开 AI 设置查看新端点",
  "Plugin manifest must be smaller than 64 KB.": "插件清单必须小于 64 KB。",

  // history
  "SESSION HISTORY": "会话历史",
  "SQLite · {count} sessions · {size}": "SQLite · {count} 个会话 · {size}",

  "Search history": "搜索历史",
  "search command history": "搜索命令历史",
  "search commands": "搜索命令",

  "started {start} · ended {end} · auth {auth}": "开始 {start} · 结束 {end} · 认证 {auth}",
  "output {size}": "输出 {size}",
  "commands {count}": "命令 {count}",
  "audits {count}": "审计 {count}",
  "no commands captured. Enable “Capture typed commands” in Settings before connecting.":
    "没有捕获命令。连接前请在设置中开启「捕获输入命令」。",
  "Delete history for {host}?": "删除 {host} 的历史？",
  "Delete ALL stored session history?": "删除全部已存储的会话历史？",
  "{count} findings": "{count} 项发现",
  "session deleted": "会话已删除",
  "copied": "已复制",
  "filter host / user / status": "筛选主机 / 用户 / 状态",
  "clear all": "全部清空",
  "Output is stored unencrypted in the app config directory. It may contain secrets; commands are captured only when enabled in Settings.":
    "输出以未加密形式保存在应用配置目录中，可能包含密钥；仅当在设置中开启时才捕获命令。",
  "no recorded sessions": "没有记录的会话",
  "no audit records": "没有审计记录",
  "working…": "处理中…",
  "output truncated to the first 2 MB": "输出已截断为前 2 MB",
  "(no output recorded)": "（没有记录输出）",
  "refresh": "刷新",

  // AI
  "AI // COPILOT": "AI // 助手",
  "AI SETTINGS": "AI 设置",

  "No API key yet. Enter one below or set OPENAI_API_KEY in the environment.":
    "还没有 API Key。填入下面的 Key，或在环境变量里设置 OPENAI_API_KEY。",
  "configured · leave blank to keep": "已配置 · 留空保持不变",
  "saving…": "保存中…",
  "testing…": "测试中…",
  "The key is stored in the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service) and is not read by the frontend. OPENAI_API_KEY takes priority if set. A legacy config key is still used as fallback.":
    "Key 优先保存到 OS keychain（Windows Credential Manager / macOS Keychain / Linux Secret Service），前端不会读取；若设置了 OPENAI_API_KEY，环境变量优先。旧配置文件中的 Key 仍可作为 fallback。",
  "context attached": "已附加上下文",
  "no context": "无上下文",
  "Ask AI to troubleshoot with current telemetry and the SSH session.":
    "让 AI 结合当前遥测与 SSH 会话排查问题。",
  "“Explain the current CPU / memory load”": "「解释当前 CPU / 内存负载」",
  "“What does this error mean?”": "「这条报错是什么意思？」",
  "“Give me a safe firewall check command”": "「给我一条安全的防火墙检查命令」",
  "Select text in the terminal and press Ctrl+I to attach it to the draft.":
    "在终端选中文本后按 Ctrl+I，内容会自动填入输入框。",
  "AI is thinking": "AI 正在思考",
  "stopping…": "停止中…",
  "waiting…": "等待中…",
  "send ↵": "发送 ↵",
  "telemetry + ssh context": "遥测 + SSH 上下文",
  "credentials not attached": "不附加凭据",
  "api key": "API Key",
  "base url": "Base URL",
  "save": "保存",
  "clear key": "清除密钥",
  "read only": "只读",
  "inserted · review and press Enter to run": "已插入 · 检查后按 Enter 执行",
  "Saved. Takes effect on the next message.": "已保存。下一次发送生效。",
  "Saved API key cleared (keychain/config file).": "已清除已保存的 API Key（keychain/配置文件）。",
  "Connection OK: {answer}": "连接成功：{answer}",
  "AI assistant is only available in the Tauri desktop app.": "AI 助手只能在 Tauri 桌面应用内使用。",
  "Request cancelled.": "请求已取消。",
  "Could not insert into the terminal.": "无法插入到终端。",

  "error": "错误",
  "context preview": "上下文预览",
  "content attached to draft": "内容已附加到草稿",
  "attach last 80 terminal lines": "附加最近 80 行终端输出",
  "Ask about this VPS, a command, or the error in your terminal…":
    "询问这台 VPS、某条命令或终端里的错误…",
  "AI prompt": "AI 输入",
  "AI settings": "AI 设置",
  "Clear conversation": "清空对话",
  "Close AI panel": "关闭 AI 面板",
  "stop": "停止",
  "send": "发送",
  "insert": "插入",
  "在终端选中文本后按 Ctrl+I，内容会自动填入输入框。":
    "在终端选中文本后按 Ctrl+I，内容会自动填入输入框。",
  "provider": "提供方",
  "api key stored in Windows Credential Manager": "API Key 保存在 Windows 凭据管理器",
  "save settings": "保存设置",

  // SFTP / forward / security

  "Interface scale": "界面缩放",
  "Scale the whole UI; terminal font size is separate": "缩放整个界面；终端字号单独设置",
  downloads: "下载",
  "Default download directory": "默认下载位置",
  "Leave blank to ask for a location on every download": "留空则每次下载时询问保存位置",
  "Ask every time": "每次询问",
  browse: "浏览",
  "saved {name} · {size}": "已保存 {name} · {size}",
  "more options for {name}": "{name} 的更多选项",
  Downloads: "下载列表",
  "no downloads yet": "还没有下载记录",
  done: "完成",
  failed: "失败",
  "Open download location": "打开下载所在位置",
  open: "打开",
  "clear list": "清空列表",
  "copy path": "复制路径",
  "SFTP file browser": "SFTP 文件浏览",
  "remote files · active tab · max 4 MB": "远程文件 · 当前标签 · 最大 4 MB",

  "Connect SSH before inserting a snippet.": "请先连接 SSH 会话，再插入命令片段。",
  "Connect SSH before inserting a command.": "请先连接 SSH 会话。",
  "Command is empty; nothing inserted.": "命令为空，未插入。",
  "Multi-line command copied; bracketed paste is unavailable, so it was not inserted.":
    "多行命令已复制；当前终端不支持括号粘贴，未自动插入。",
  "Connect SSH before browsing remote files.": "连接 SSH 后才能浏览远端文件。",
  "Parent directory": "上级目录",
  "Remote path": "远端路径",
  "new folder": "新建目录",
  "empty directory": "空目录",
  "download {name}": "下载 {name}",
  "select {name}": "选择 {name}",
  "listing truncated at 500 entries": "列表截断为 500 项",
  "{count} entries": "{count} 项",
  "chunked · upload overwrites · no delete of non-empty dirs": "分块传输 · 上传覆盖 · 不删除非空目录",

  "path": "路径",
  "go": "前往",
  "up": "上级",
  "size": "大小",
  "modified": "修改时间",
  "download": "下载",
  "upload": "上传",
  "rename": "重命名",
  "delete": "删除",

  "Local port forwarding": "本地端口转发",
  "local 127.0.0.1 · active tab · MVP": "本地 127.0.0.1 · 当前标签 · MVP",
  "Connect SSH before creating a local forward.": "连接 SSH 后才能创建本地端口转发。",
  "0 = choose a free port": "0 = 自动选择空闲端口",
  "Each local connection opens a separate authenticated SSH transport and a direct-tcpip channel. This is a local-only MVP; no remote forwarding and no ProxyJump yet.":
    "每个本地连接都会建立独立的认证 SSH 传输和 direct-tcpip 通道。这是仅本地 MVP；暂不支持远程转发和 ProxyJump。",
  "session #{id} · rules stop when the tab disconnects": "会话 #{id} · 标签断开时规则停止",
  "listening {bind} → {dest}": "正在监听 {bind} → {dest}",
  "stopped {bind}": "已停止 {bind}",
  "PORT FORWARD": "端口转发",
  "local forward": "本地转发",
  "remote forward": "远程转发",
  "remote bind host": "远端监听地址",
  "remote port": "远端端口",
  "local dest host": "本地目标地址",
  "local dest port": "本地目标端口",
  "Remote listen port must be 1-65535.": "远端监听端口必须为 1-65535。",
  "Local destination port must be 1-65535.": "本地目标端口必须为 1-65535。",
  "Remote and local hosts are required.": "远端和本地地址必填。",
  "remote {bind} → local {dest}": "远端 {bind} → 本地 {dest}",
  "stopped remote {bind}": "已停止远程转发 {bind}",
  "The remote server listens and forwards each connection to a local TCP destination through this SSH session.":
    "远端服务器监听，并把每个连接通过此 SSH 会话转发到本地 TCP 目标。",
  "Each local connection opens a separate authenticated SSH transport and a direct-tcpip channel.":
    "每个本地连接都会建立独立的认证 SSH 传输和 direct-tcpip 通道。",

  "local port": "本地端口",
  "destination host": "目标主机",
  "destination port": "目标端口",
  "start": "启动",

  "Read-only checks for SSH config, listeners/firewall, patches, failed logins/fail2ban and SSH directory permissions. No third-party IP scanning and no password attempts.":
    "只读检查 SSH 配置、监听端口/防火墙、补丁、登录失败/fail2ban 与 SSH 目录权限。不会扫描第三方 IP，也不会尝试口令。",
  "Connect SSH before running a remote security audit.": "连接 SSH 后才能运行远端安全审计。",
  "auditing…": "审计中…",
  "re-run audit": "重新审计",
  "run audit": "运行审计",
  "ask AI": "询问 AI",
  "Click run audit to perform a read-only check.": "点击运行审计执行一次只读检查。",
  "SEC // AUDIT": "安全 // 审计",
  "read-only · fixed command allowlist": "只读 · 固定命令白名单",
  "Run read-only audit": "运行只读审计",
  "Close security panel": "关闭安全面板",
  "scanning…": "扫描中…",
  "no findings": "没有发现",
  "read-only checks": "只读检查",


  node: "节点",
  link: "链路",
  auth: "认证",
  uptime: "运行时间",
  host: "主机",
  user: "用户",
  username: "用户名",
  password: "密码",
  port: "端口",
  cpu: "CPU",
  memory: "内存",
  pty: "终端",
  remote: "远端",
  local: "本机",
  downlink: "下行",
  uplink: "上行",
  active: "活动",
  idle: "空闲",
  encrypted: "已加密",
  offline: "离线",
  complete: "补全",
  interrupt: "中断",
  history: "历史",
  threads: "线程",
  SETTINGS: "设置",
  Settings: "设置",
  language: "语言",
  appearance: "外观",
  about: "关于",
  data: "数据",
  apply: "应用",
  remove: "移除",
  enabled: "已启用",
  disabled: "已禁用",
  enable: "启用",
  disable: "禁用",
  days: "天",
  Retention: "保留时间",
  snippets: "命令片段",
  prompts: "提示词",
  providers: "提供方",
  manage: "管理",
  use: "使用",
  copy: "复制",
  search: "搜索",
  resume: "继续",
  stored: "已存储",
  test: "测试",
  thinking: "思考中",
  collecting: "采集中",
  high: "高危",
  medium: "中危",
  dir: "目录",
  model: "模型",
  "Close AI settings": "关闭 AI 设置",
  "New directory name:": "新目录名称：",
  "A plugin with id \"{id}\" already exists.": "插件 ID「{id}」已存在。",
  "A theme with id \"{id}\" already exists.": "主题 ID「{id}」已存在。",
};

const dictionaries: Record<Language, Record<string, string>> = {
  en: {
    language: "Language",
    "find in terminal": "find in terminal",
    "previous match": "previous match",
    "next match": "next match",
    "no matches": "no matches",
    "close search": "close search",
    edit: "edit",
    name: "name",
    group: "group",
    authentication: "authentication",
    clear: "clear",
    "Host manager": "Host manager",
    "OpenSSH X11/agent session": "OpenSSH X11/agent session",
    "import ssh config": "import ssh config",
    "No Host entries found in ~/.ssh/config.": "No Host entries found in ~/.ssh/config.",
    "Imported {count} hosts; ProxyJump entries need manual setup.": "Imported {count} hosts; ProxyJump entries need manual setup.",
    "HOST MANAGER": "HOST MANAGER",
    "saved connections · no passwords stored": "saved connections · no passwords stored",
    "filter hosts": "filter hosts",
    "new host": "new host",
    "use current": "use current",
    "no saved hosts": "no saved hosts",
    "Host is required.": "Host is required.",
    "Username is required.": "Username is required.",
    "Port must be 1-65535.": "Port must be 1-65535.",
    "Private key path is required for key auth.": "Private key path is required for key auth.",
    "Delete host {name}?": "Delete host {name}?",
    "add host": "add host",
    "edit host": "edit host",
    "auto reconnect": "auto reconnect",
    "save host": "save host",
    "save changes": "save changes",
    "by Mr.N": "by Mr.N",
    "Created by Mr.N": "Created by Mr.N",
    "Screen saver": "Screen saver",
    "split view": "split view",
    "close split view": "close split view",
    "local forward": "local forward",
    "remote forward": "remote forward",
    "remote bind host": "remote bind host",
    "remote port": "remote port",
    "local dest host": "local dest host",
    "local dest port": "local dest port",
    "Remote and local hosts are required.": "Remote and local hosts are required.",
    "Remote listen port must be 1-65535.": "Remote listen port must be 1-65535.",
    "Local destination port must be 1-65535.": "Local destination port must be 1-65535.",
    "ssh keys": "ssh keys",
    "Keys live in ~/.ssh; private key contents are never read by the UI.": "Keys live in ~/.ssh; private key contents are never read by the UI.",
    "new key name": "new key name",
    "generate ed25519": "generate ed25519",
    "open ~/.ssh": "open ~/.ssh",
    "no ssh keys": "no ssh keys",
    "copy public key": "copy public key",
    "Generated {name}.": "Generated {name}.",
    "Deleted {name}.": "Deleted {name}.",
    "Delete key {name}? This cannot be undone.": "Delete key {name}? This cannot be undone.",
    replay: "replay",
    "session replay": "session replay",
    pause: "pause",
    play: "play",
    finished: "finished",
    replaying: "replaying",
    "screen protected": "screen protected",
    "click or press any key to return": "click or press any key to return",
  },
  "zh-CN": zh,
};

type I18nValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

const interpolate = (
  template: string,
  vars?: Record<string, string | number>
) => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match
  );
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const translated = dictionaries[language][key] ?? key;
      return interpolate(translated, vars);
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
};
