import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";

export type XTermHandle = {
  write: (data: string) => void;
  reset: () => void;
  clear: () => void;
  focus: () => void;
  /** Plain-text tail of the scrollback buffer. */
  getBuffer: (maxLines?: number) => string;
  /** Whether the remote shell enabled bracketed paste. */
  bracketedPaste: () => boolean;
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  clearSearch: () => void;
};

export type XTermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  accent: string;
};

type Props = {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onReady?: () => void;
  theme?: XTermTheme;
  fontSize?: number;
  /** Ctrl+I with a non-empty selection. */
  onSelectionShortcut?: (selection: string) => void;
};

const makeTheme = (theme?: XTermTheme) => {
  const background = theme?.background ?? "#050c0b";
  const foreground = theme?.foreground ?? "#c9fff6";
  const accent = theme?.accent ?? "#00ffcc";
  return {
    background,
    foreground,
    cursor: theme?.cursor ?? accent,
    cursorAccent: "#001a16",
    selectionBackground:
      theme?.selectionBackground ?? "rgba(0, 255, 204, 0.24)",
    black: "#0a0a0a",
    red: "#ff4d6d",
    green: accent,
    yellow: "#ffc857",
    blue: "#4dc9ff",
    magenta: "#ff79c6",
    cyan: accent,
    white: "#d9fff7",
    brightBlack: "#2a4a44",
    brightRed: "#ff8fa3",
    brightGreen: theme?.cursor ?? "#8dfff0",
    brightYellow: "#ffe08a",
    brightBlue: "#8bd8ff",
    brightMagenta: "#ffa8d8",
    brightCyan: foreground,
    brightWhite: "#f4fffd",
  };
};

/**
 * Real terminal emulator. ANSI colours, cursor addressing, line editing,
 * alternate screen (vim/htop), scrollback and UTF-8 text are handled by
 * xterm.js instead of the previous plain-text buffer.
 */
export const XTermTerminal = forwardRef<XTermHandle, Props>(
  function XTermTerminal(
    { onData, onResize, onReady, theme, fontSize, onSelectionShortcut },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);

    const dataRef = useRef(onData);
    const resizeRef = useRef(onResize);
    const readyRef = useRef(onReady);
    const selectionRef = useRef(onSelectionShortcut);

    useEffect(() => {
      dataRef.current = onData;
    }, [onData]);

    useEffect(() => {
      resizeRef.current = onResize;
    }, [onResize]);

    useEffect(() => {
      readyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      selectionRef.current = onSelectionShortcut;
    }, [onSelectionShortcut]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => termRef.current?.write(data),
        reset: () => termRef.current?.reset(),
        clear: () => termRef.current?.clear(),
        focus: () => termRef.current?.focus(),
        getBuffer: (maxLines = 80) => {
          const term = termRef.current;
          if (!term) return "";
          const buffer = term.buffer.active;
          const start = Math.max(0, buffer.length - Math.max(1, maxLines));
          const lines: string[] = [];
          for (let index = start; index < buffer.length; index += 1) {
            const line = buffer.getLine(index);
            lines.push(line?.translateToString(true) ?? "");
          }
          return lines.join("\n").replace(/\s+$/, "");
        },
        bracketedPaste: () =>
          termRef.current?.modes.bracketedPasteMode ?? false,
        findNext: (query: string) =>
          searchRef.current?.findNext(query, {
            decorations: {
              matchBackground: "#00ffcc44",
              activeMatchBackground: "#00ffcc99",
              matchOverviewRuler: "#00ffcc77",
              activeMatchColorOverviewRuler: "#00ffccaa",
            },
          }) ?? false,
        findPrevious: (query: string) =>
          searchRef.current?.findPrevious(query, {
            decorations: {
              matchBackground: "#00ffcc44",
              activeMatchBackground: "#00ffcc99",
              matchOverviewRuler: "#00ffcc77",
              activeMatchColorOverviewRuler: "#00ffccaa",
            },
          }) ?? false,
        clearSearch: () => searchRef.current?.clearDecorations(),
      }),
      []
    );

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily:
          '"Share Tech Mono", "JetBrains Mono", "Cascadia Code", Consolas, monospace',
        fontSize: fontSize ?? 13,
        lineHeight: 1.25,
        letterSpacing: 0,
        scrollback: 5000,
        screenReaderMode: true,
        convertEol: false,
        allowTransparency: false,
        theme: makeTheme(theme),
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      const search = new SearchAddon();
      searchRef.current = search;
      term.loadAddon(search);
      term.open(host);
      termRef.current = term;
      fitRef.current = fit;

      term.onData((data) => dataRef.current(data));
      term.onResize(({ cols, rows }) => resizeRef.current(cols, rows));

      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        // Ctrl+I sends the current selection to the AI drawer. With no
        // selection it falls through as the normal Tab key.
        if (
          event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !event.metaKey &&
          event.code === "KeyI"
        ) {
          const selection = term.getSelection();
          if (selection.trim()) {
            event.preventDefault();
            selectionRef.current?.(selection);
            return false;
          }
        }

        // Terminal-style copy/paste, leaving plain Ctrl+C as SIGINT.
        if (event.ctrlKey && event.shiftKey && event.code === "KeyC") {
          const selection = term.getSelection();
          if (selection) {
            void navigator.clipboard.writeText(selection).catch(() => {});
          }
          return false;
        }

        if (event.ctrlKey && event.shiftKey && event.code === "KeyV") {
          void navigator.clipboard
            .readText()
            .then((text) => {
              if (text) dataRef.current(text);
            })
            .catch(() => {});
          return false;
        }

        return true;
      });

      let frame = 0;
      const refit = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          try {
            fit.fit();
          } catch {
            // The container can briefly have zero size while mounting.
          }
        });
      };

      const observer = new ResizeObserver(refit);
      observer.observe(host);

      refit();
      void document.fonts?.ready.then(refit);
      const readyTimer = window.setTimeout(() => {
        refit();
        term.focus();
        readyRef.current?.();
      }, 40);

      return () => {
        window.clearTimeout(readyTimer);
        window.cancelAnimationFrame(frame);
        observer.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = makeTheme(theme);
      }
    }, [theme]);

    useEffect(() => {
      if (!termRef.current) return;
      termRef.current.options.fontSize = fontSize ?? 13;
      fitRef.current?.fit();
    }, [fontSize]);

    return <div className="xterm-host" ref={hostRef} aria-label="SSH terminal" />;
  }
);
