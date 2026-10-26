<p align="center">
  <img src="docs/banner.png" alt="VPS//SENTINEL — a cyberpunk command center for your VPS" width="100%" />
</p>

<h1 align="center">VPS//SENTINEL</h1>

<p align="center">
  <b>A cyberpunk desktop command center for the servers you actually run.</b><br />
  Real terminal. Real telemetry. SFTP. AI copilot. Plugins. No browser tabs.
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" />
  <img alt="React 18" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-B7410E?logo=rust&logoColor=white" />
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?logo=windows&logoColor=white" />
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-00ffcc" />
  <a href="https://github.com/NatShiftN/vps-sentinel/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/NatShiftN/vps-sentinel/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
</p>

<p align="center">
  <a href="https://github.com/NatShiftN/vps-sentinel/releases/latest"><b>⬇ Download for Windows</b></a>
  &nbsp;·&nbsp;
  <a href="#product-tour">Product tour</a>
  &nbsp;·&nbsp;
  <a href="#features">Features</a>
  &nbsp;·&nbsp;
  <a href="#build-from-source">Build from source</a>
</p>

---

## Why this exists

Most VPS work is spread across a terminal, an SSH config file, a file browser, a metrics dashboard, a notes app, and an AI chat tab. VPS//SENTINEL puts the whole loop in one desktop window:

> **Connect → watch the box → work in the terminal → move files → diagnose → ask AI → keep a record.**

It is a real SSH console first, and a cyberpunk control room second. No mock data in the telemetry panels, no fake terminal, no browser runtime in the middle.

### Who it is for

- **Homelab and VPS operators** who want one place for SSH, files, forwarding and health.
- **Developers on call** who need a fast read on CPU / RAM / disk / latency without opening five tools.
- **People who like terminals** and want a focused, keyboard-friendly desktop console.
- **Anyone who wants local, inspectable tooling** instead of another hosted dashboard.

---

## Product tour

> **Privacy note:** the public README intentionally ships without screenshots of a real machine. Product screenshots can expose hostnames, CPU models, disks, IP addresses, host keys and terminal contents. Run the app against a demo host and publish your own redacted screenshots if you want a gallery.

| Surface | What it gives you |
| --- | --- |
| **Command center** | Live local / remote telemetry, link health, latency and a real xterm terminal in one window. |
| **SSH workbench** | Tabs, split view, broadcast input, terminal search, host manager and key manager. |
| **Server view** | CPU, RAM, disk, network, load, kernel, uptime and SSH RTT. |
| **Files & tunnels** | SFTP with native Save As, download history, local and remote forwarding. |
| **Memory** | SQLite session history, command search, audit records and replay. |
| **Extras** | AI copilot, security audit, themes, declarative plugins, screen saver and bilingual UI. |

---

## Features

### Terminal that respects the terminal

- Real **xterm.js** terminal over an SSH PTY (vim, htop, less, colors, scrollback).
- Multiple tabs, **two-pane split view**, and **broadcast input** to connected tabs.
- **Ctrl+F** terminal search across scrollback with next / previous match.
- Copy/paste, font size, theme-aware palette, optional AI selection handoff.

### SSH workbench

- Password, private key and **ssh-agent** authentication.
- **ProxyJump** (password jump host) and host-key pinning.
- **Host Manager**: saved profiles, groups, key path, one-click connect.
- **`~/.ssh/config` import** with HostName / User / Port / IdentityFile.
- **SSH key manager**: list keys, copy public key, generate Ed25519, delete.
- **Local and remote port forwarding** (remote requires server-side `tcpip-forward`).
- **X11 / agent forwarding** through a system OpenSSH + ConPTY sidecar (`-X -A`).

### Server status and SSH health

- Remote **CPU usage**, **RAM**, **disk**, **network throughput**, load, kernel and uptime.
- **SSH latency** probes every 5 seconds with a sparkline.
- Connection health: `healthy` / `degraded` / `lost` / `handshake`.
- Session uptime, bytes in/out, idle time, keepalive and reconnect count.
- Automatic reconnect with backoff.

### Files and forwarding

- SFTP browser with upload, download, rename, mkdir and delete.
- Native **Save As** download dialog and a configurable default download folder.
- Download history with status and “open location”.
- File-row `⋯` menu for download / rename / delete / copy path.

### AI copilot and security audit

- OpenAI-compatible AI copilot with terminal context and command insertion.
- API key stored in the OS keychain; never in the repo or plugin files.
- Read-only security audit for SSH config, listeners/firewall, updates and exposure.

### Personalization

- Built-in **theme / layout market** (declarative JSON, no code).
- **Plugin hub** for command snippets, AI prompts and provider presets.
- Local declarative plugins only — no executable plugin code.
- Borderless custom window, UI scale 85–125%, terminal font size 11–18px.
- One-click fullscreen **screen saver** with clock and privacy overlay.

### History and privacy

- SQLite session history: terminal output, optional command capture, audit records.
- Search across sessions and **search command history**.
- **Replay** recorded terminal output with pause / speed controls.
- Command capture is **off by default**; history is stored locally and unencrypted.
- Retention configurable from 1 to 90 days.

### Bilingual by design

The app ships with **English** and **Simplified Chinese**, auto-detected from the OS and switchable in **Settings → Language**. The README is available in both languages too.

---

## Install (Windows portable)

1. Download the latest `VPS-SENTINEL-*-win64.zip` from [Releases](https://github.com/NatShiftN/vps-sentinel/releases/latest).
2. Extract the ZIP.
3. Keep these two files **in the same folder**:
   - `VPS-SENTINEL.exe`
   - `WebView2Loader.dll`
4. Run `VPS-SENTINEL.exe`.

Requirements:

- Windows 10 / 11 x64
- Microsoft Edge **WebView2 Runtime** (normally preinstalled)
- No installer, no registry entries
- The build is **not code-signed**; SmartScreen may show a warning.

### X11 / agent forwarding prerequisites

- Windows **OpenSSH Client** (`C:\Windows\System32\OpenSSH\ssh.exe`).
- X11: a local X server such as **VcXsrv** or **X410**.
- Agent forwarding: a running SSH agent (Windows OpenSSH Agent or Pageant).
- Open **Host Manager → X11/A** to start a separate ConPTY session with `-X -A`.

> X11/agent sessions use **system OpenSSH**, its own `known_hosts`, and are separate from the native ssh2 session (SFTP / metrics / history are not shared).

---

## Build from source

### Requirements

- Node.js **20+**
- Rust **stable**
- Windows: Visual Studio Build Tools with **MSVC + Windows SDK** (recommended), WebView2 Runtime
- Linux: WebKitGTK 4.1, GTK 3, OpenSSL, `pkg-config`

```bash
npm ci
npm test
npm run build
npm run tauri build
```

For the portable GNU build used by this project:

```powershell
npm run build
cd src-tauri
cargo build --release --features custom-protocol
```

Copy `WebView2Loader.dll` next to the output executable.

### Project layout

```text
src/                 React UI, terminal, settings, plugins
src-tauri/          Rust backend: SSH, SFTP, metrics, SQLite, ConPTY
public/             fonts and static assets
docs/banner.png     README banner
```

### Architecture

```text
┌──────────────────────────────┐
│ React + xterm.js             │
│ tabs · settings · plugins    │
└──────────────┬───────────────┘
               │ Tauri IPC / events
┌──────────────▼───────────────┐
│ Rust backend                 │
│ ssh2 · sysinfo · rusqlite    │
│ portable-pty · rfd · keyring │
└──────────────┬───────────────┘
               │ SSH / SFTP / system ssh
          ┌────▼────┐
          │  VPS    │
          └─────────┘
```

---

## Security & privacy

- **No telemetry is sent anywhere by the app itself.**
- SSH passwords/passphrases live only in memory and are not written to disk.
- AI API keys go to the OS keychain where available.
- Terminal history is **local SQLite, unencrypted** by design; treat it as sensitive.
- Command capture is **off by default** because it can capture passwords typed at prompts.
- Themes and plugins are **declarative JSON**; no JS/HTML/CSS or executable plugin code.
- X11/agent sidecar sessions use the system OpenSSH client and its own host-key store.
- The project contains no preconfigured API keys or credentials.

---

## Known limitations

- Windows portable build only; Linux/macOS are not packaged yet.
- No code signing; SmartScreen warnings are expected.
- X11/agent forwarding requires external X server / SSH agent and is a separate OpenSSH session.
- Remote port forwarding depends on server `tcpip-forward` support.
- Split view is two tabs side by side, not arbitrary N panes.
- History is unencrypted; command capture is intentionally conservative.
- No cloud sync, no central dashboard, no hosted account.

Roadmap: signed installers, macOS/Linux packages, encrypted history option, more terminal layouts, and a verified remote-forward test matrix.

---

## Contributing

Issues and pull requests are welcome.

```bash
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Please do not commit test credentials, private keys, local history databases or `ai_config.json`.

---

## License

[MIT](LICENSE) © 2026 **Mr.N**

<p align="center">
  <sub>Built with Tauri 2, React 18, Rust, xterm.js and a lot of phosphor green.</sub><br />
  <sub>If this is useful, a ⭐ helps other VPS people find it.</sub>
</p>
