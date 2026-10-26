import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../lib/i18n";
import { isTauriRuntime } from "../lib/tauri";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Props = {
  active: boolean;
  onExit: () => void;
};

export function ScreenSaver({ active, onExit }: Props) {
  const { language, t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const armedAt = useRef(0);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    if (!active || !isTauriRuntime()) return;
    const appWindow = getCurrentWindow();
    void appWindow.setFullscreen(true).catch(() => undefined);
    return () => {
      void appWindow.setFullscreen(false).catch(() => undefined);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    armedAt.current = Date.now();
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const exit = (event: Event) => {
      if (Date.now() - armedAt.current < 450) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onExitRef.current();
    };
    const onKey = (event: KeyboardEvent) => exit(event);
    const onClick = (event: MouseEvent) => exit(event);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onClick, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onClick, true);
    };
  }, [active]);

  const time = useMemo(
    () =>
      now.toLocaleTimeString(language === "zh-CN" ? "zh-CN" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [now, language]
  );
  const date = useMemo(
    () =>
      now.toLocaleDateString(language === "zh-CN" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }),
    [now, language]
  );

  if (!active) return null;

  return (
    <div className="screen-saver" role="dialog" aria-modal="true">
      <div className="screen-saver__grid" aria-hidden />
      <div className="screen-saver__glow" aria-hidden />
      <div className="screen-saver__stars" aria-hidden>
        {Array.from({ length: 28 }, (_, index) => (
          <i
            key={index}
            style={
              {
                "--x": `${(index * 37) % 100}%`,
                "--y": `${(index * 61) % 100}%`,
                "--delay": `${(index % 9) * 0.7}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <header className="screen-saver__brand">
        <b>
          VPS<span>//</span>SENTINEL
        </b>
        <small>{t("screen protected")}</small>
      </header>

      <main className="screen-saver__clock">
        <div className="screen-saver__sigil" aria-hidden>
          ◈
        </div>
        <time>{time}</time>
        <p>{date}</p>
      </main>

      <footer className="screen-saver__foot">
        <span>{t("click or press any key to return")}</span>
        <span>Mr.N · v0.1.0</span>
      </footer>
    </div>
  );
}
